import "server-only";

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export type RequestPolicyReason =
  | "missing_host"
  | "untrusted_host"
  | "forwarded_host_mismatch"
  | "missing_origin"
  | "invalid_origin"
  | "untrusted_origin";

export type RequestPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: RequestPolicyReason };

export type PolicyHeaders = {
  get(name: string): string | null;
};

type ParsedHost = {
  host: string;
  hostname: string;
  port: string;
  portExplicit: boolean;
  explicitPort: string;
};

function parseHostValue(value: string): ParsedHost | null {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 512) {
    return null;
  }

  // Host/Origin hosts never contain path, userinfo, query, separators or
  // whitespace. Rejeitar explicitamente evita interpretações divergentes.
  if (/[\s,/@\\?#]/.test(trimmed)) {
    return null;
  }

  try {
    const url = new URL(`http://${trimmed}`);

    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    let portExplicit = false;
    let explicitPort = "";
    if (trimmed.startsWith("[")) {
      const closingBracket = trimmed.indexOf("]");
      const suffix = trimmed.slice(closingBracket + 1);
      if (suffix) {
        if (!/^:\d+$/.test(suffix)) {
          return null;
        }
        portExplicit = true;
        explicitPort = String(Number(suffix.slice(1)));
      }
    } else {
      const colon = trimmed.lastIndexOf(":");
      if (colon !== -1) {
        if (trimmed.indexOf(":") !== colon || !/^\d+$/.test(trimmed.slice(colon + 1))) {
          return null;
        }
        portExplicit = true;
        explicitPort = String(Number(trimmed.slice(colon + 1)));
      }
    }

    if (!hostname) {
      return null;
    }

    return {
      host: url.host.toLowerCase(),
      hostname,
      port: url.port,
      portExplicit,
      explicitPort,
    };
  } catch {
    return null;
  }
}

function parseTrustedHosts(configuredHosts: string | undefined): ParsedHost[] {
  if (!configuredHosts) {
    return [];
  }

  const entries = configuredHosts
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsed: ParsedHost[] = [];

  for (const entry of entries) {
    const host = parseHostValue(entry);
    if (host) {
      parsed.push(host);
    } else {
      console.warn(
        `[request-policy] Entrada ignorada em HORAFLOW_TRUSTED_HOSTS: ${entry}`,
      );
    }
  }

  return parsed;
}

function isTrustedHost(host: ParsedHost, configuredHosts: ParsedHost[]): boolean {
  if (LOOPBACK_HOSTNAMES.has(host.hostname)) {
    return true;
  }

  return configuredHosts.some((configured) => {
    if (configured.hostname !== host.hostname) {
      return false;
    }

    // Sem porta explícita, a configuração confia no hostname em qualquer porta.
    // Com porta (inclusive :80/:443), a comparação é exata.
    return !configured.portExplicit ||
      (host.portExplicit && configured.explicitPort === host.explicitPort);
  });
}

function sameHost(left: string, right: string): boolean {
  const parsedLeft = parseHostValue(left);
  const parsedRight = parseHostValue(right);

  return Boolean(
    parsedLeft &&
      parsedRight &&
      parsedLeft.hostname === parsedRight.hostname &&
      parsedLeft.port === parsedRight.port,
  );
}

function forwardedHostIsConsistent(
  headers: PolicyHeaders,
  requestHost: ParsedHost,
): boolean {
  const forwardedHost = headers.get("x-forwarded-host");

  if (forwardedHost !== null) {
    const values = forwardedHost.split(",").map((value) => value.trim());

    if (values.length === 0) {
      return false;
    }

    for (const value of values) {
      if (!value || !sameHost(value, requestHost.host)) {
        return false;
      }
    }
  }

  const forwarded = headers.get("forwarded");

  if (forwarded !== null) {
    const elements = forwarded.split(",");

    if (elements.length === 0) {
      return false;
    }

    for (const element of elements) {
      const match = /(?:^|;)\s*host=(?:"([^"]*)"|([^;,\s]+))/i.exec(element);
      const forwardedHostValue = match?.[1] ?? match?.[2];

      // Require an unambiguous host on every element; never infer the
      // application host from an untrusted proxy chain.
      if (!forwardedHostValue || !sameHost(forwardedHostValue, requestHost.host)) {
        return false;
      }
    }
  }

  return true;
}

function validateOrigin(
  origin: string | null,
  requestHost: ParsedHost,
): RequestPolicyDecision {
  if (origin === null || origin.trim() === "") {
    return { allowed: false, reason: "missing_origin" };
  }

  if (origin.trim().toLowerCase() === "null") {
    return { allowed: false, reason: "missing_origin" };
  }

  let parsedOrigin: URL;

  try {
    parsedOrigin = new URL(origin);
  } catch {
    return { allowed: false, reason: "invalid_origin" };
  }

  if (
    parsedOrigin.protocol !== "http:" &&
    parsedOrigin.protocol !== "https:"
  ) {
    return { allowed: false, reason: "invalid_origin" };
  }

  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    return { allowed: false, reason: "invalid_origin" };
  }

  const defaultPort = parsedOrigin.protocol === "https:" ? "443" : "80";
  const originPort = parsedOrigin.port || defaultPort;
  const requestPort = requestHost.portExplicit
    ? requestHost.explicitPort
    : defaultPort;

  if (
    parsedOrigin.hostname.toLowerCase().replace(/^\[|\]$/g, "") !==
      requestHost.hostname ||
    originPort !== requestPort
  ) {
    return { allowed: false, reason: "untrusted_origin" };
  }

  return { allowed: true };
}

export function evaluateRequestPolicy({
  method,
  headers,
  trustedHosts = process.env.HORAFLOW_TRUSTED_HOSTS,
}: {
  method: string;
  headers: PolicyHeaders;
  trustedHosts?: string;
}): RequestPolicyDecision {
  const rawHost = headers.get("host");

  if (!rawHost) {
    return { allowed: false, reason: "missing_host" };
  }

  const requestHost = parseHostValue(rawHost);

  if (!requestHost) {
    return { allowed: false, reason: "untrusted_host" };
  }

  const configuredHosts = parseTrustedHosts(trustedHosts);

  if (!isTrustedHost(requestHost, configuredHosts)) {
    return { allowed: false, reason: "untrusted_host" };
  }

  if (!forwardedHostIsConsistent(headers, requestHost)) {
    return { allowed: false, reason: "forwarded_host_mismatch" };
  }

  const normalizedMethod = method.toUpperCase();

  if (SAFE_METHODS.has(normalizedMethod)) {
    return { allowed: true };
  }

  return validateOrigin(headers.get("origin"), requestHost);
}
