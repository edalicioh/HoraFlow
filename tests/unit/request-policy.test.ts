import { describe, expect, it } from "vitest";
import { evaluateRequestPolicy } from "@/lib/request-policy";

function decide({
  host,
  origin,
  trustedHosts,
}: {
  host: string;
  origin?: string;
  trustedHosts: string;
}) {
  const headers = new Headers({ host });
  if (origin !== undefined) headers.set("origin", origin);

  return evaluateRequestPolicy({ method: origin ? "POST" : "GET", headers, trustedHosts });
}

describe("portas de hosts confiáveis", () => {
  it.each(["localhost:9999", "127.0.0.1:8080", "[::1]:443"])(
    "mantém loopback %s confiável por padrão",
    (host) => {
      expect(decide({ host, trustedHosts: "" })).toEqual({ allowed: true });
    },
  );

  it.each([
    ["horaflow.lan:80", "horaflow.lan:80", true],
    ["horaflow.lan:80", "horaflow.lan:9999", false],
    ["horaflow.lan:80", "horaflow.lan", false],
    ["horaflow.lan:443", "horaflow.lan:443", true],
    ["horaflow.lan:443", "horaflow.lan:8443", false],
    ["horaflow.lan:443", "horaflow.lan", false],
    ["horaflow.lan", "horaflow.lan:9999", true],
    ["[2001:db8::10]:443", "[2001:db8::10]:443", true],
    ["[2001:db8::10]:443", "[2001:db8::10]:444", false],
    ["[2001:db8::10]", "[2001:db8::10]:444", true],
  ])("config %s com Host %s -> permitido=%s", (trustedHosts, host, allowed) => {
    expect(decide({ host, trustedHosts })).toEqual(
      allowed ? { allowed: true } : { allowed: false, reason: "untrusted_host" },
    );
  });

  it.each([
    ["horaflow.lan:80", "http://horaflow.lan:80"],
    ["horaflow.lan:443", "https://horaflow.lan:443"],
    ["horaflow.lan:443", "https://horaflow.lan"],
    ["[2001:db8::10]:443", "https://[2001:db8::10]:443"],
  ])("permite origem HTTP(S) coerente para %s", (host, origin) => {
    expect(decide({ host, origin, trustedHosts: host })).toEqual({ allowed: true });
  });
});
