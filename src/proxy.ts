import { NextResponse, type NextRequest } from "next/server";
import { evaluateRequestPolicy } from "@/lib/request-policy";

export function proxy(request: NextRequest) {
  const decision = evaluateRequestPolicy({
    method: request.method,
    headers: request.headers,
  });

  if (!decision.allowed) {
    console.warn(
      `[request-policy] Requisição rejeitada (${decision.reason}) em ${request.nextUrl.pathname}.`,
    );

    return NextResponse.json(
      { error: "request_rejected" },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
          Vary: "Host, Origin, X-Forwarded-Host, Forwarded",
        },
      },
    );
  }

  return NextResponse.next();
}
