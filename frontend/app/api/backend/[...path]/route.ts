import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { backendRoute, fetchBackend, finishEvent, requestEvent } from "@/lib/observability";

const MAX_BODY = 16 * 1024;
const allowed =
  /^(books(?:\/[a-zA-Z0-9-]{1,36})?|auth\/(?:register|login|logout|me)|shelf(?:\/[a-zA-Z0-9-]{1,36})?|health)$/;

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  requestId: string,
) {
  const { path } = await context.params;
  const route = path.join("/");
  if (!allowed.test(route))
    return NextResponse.json({ detail: "Route not found." }, { status: 404 });
  const mutating = !["GET", "HEAD"].includes(request.method);
  if (mutating) {
    const origin = request.headers.get("origin");
    const cloud = ["production", "preview"].includes(
      process.env.VERCEL_ENV ?? "",
    );
    // vercel dev's loopback proxy rewrites Host and preserves the public host here.
    // Cloud requests use Host; untrusted forwarded hosts must not bypass CSRF checks.
    const publicHost = cloud
      ? request.headers.get("host")
      : request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const protocol = cloud ? "https:" : request.nextUrl.protocol;
    // Browser writes must come from this app; cookie authentication needs CSRF protection.
    let sameOrigin = false;
    try {
      sameOrigin =
        !!origin &&
        !!publicHost &&
        new URL(origin).origin === `${protocol}//${publicHost}`;
    } catch {
      /* Malformed origins are rejected. */
    }
    if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json(
        { detail: "This request must come from the bookstore." },
        { status: 403 },
      );
    }
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    ) {
      return NextResponse.json(
        { detail: "Use application/json." },
        { status: 415 },
      );
    }
  }
  const backend = process.env.BACKEND_URL;
  if (!backend)
    return NextResponse.json(
      { detail: "The backend service binding is not configured." },
      { status: 503 },
    );
  let body: ArrayBuffer | undefined;
  if (mutating && request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        return NextResponse.json(
          { detail: "Request is too large." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    body = combined.buffer;
  }
  try {
    const secureCookie =
      ["production", "preview"].includes(process.env.VERCEL_ENV ?? "") ||
      process.env.COOKIE_SECURE === "true";
    const cookieName = secureCookie
      ? "__Host-margin_session"
      : "margin_session";
    const session = request.cookies.get(cookieName)?.value;
    const target = `/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
    const upstream = await fetchBackend(target, {
      method: request.method,
      body,
      headers: {
        "Content-Type": "application/json",
        Cookie:
          session && /^[A-Za-z0-9_-]{43}$/.test(session)
            ? `${cookieName}=${session}`
            : "",
      },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    }, requestId);
    if (upstream.status >= 500)
      return NextResponse.json(
        {
          detail:
            "The bookstore is temporarily unavailable. Try again shortly.",
        },
        { status: 503 },
      );
    // Python has already authorized and committed the catalog mutation.
    // Never invalidate for failed writes, auth requests, or bookshelf changes.
    if (mutating && upstream.ok && /^books(?:\/|$)/.test(route)) {
      revalidateTag("public-books", { expire: 0 });
    }
    const response = new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
    for (const cookie of upstream.headers.getSetCookie())
      response.headers.append("Set-Cookie", cookie);
    const retry = upstream.headers.get("retry-after");
    if (retry) response.headers.set("Retry-After", retry);
    return response;
  } catch {
    return NextResponse.json(
      { detail: "Could not reach the bookstore. Try again shortly." },
      { status: 503 },
    );
  }
}

async function observedProxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  // Mint at the browser boundary; never trust client-supplied correlation IDs.
  const requestId = randomUUID();
  const { path } = await context.params;
  const log = requestEvent(requestId, request.method, backendRoute(`/${path.join("/")}`), "api_request");
  const start = performance.now();
  let status = 500;
  try {
    const response = await proxy(request, context, requestId);
    status = response.status;
    response.headers.set("x-request-id", requestId);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    log.set({ failure: "bridge_error" });
    return NextResponse.json({ detail: "The bookstore is temporarily unavailable." }, {
      status: 500, headers: { "x-request-id": requestId, "Cache-Control": "no-store" },
    });
  } finally {
    finishEvent(log, status, start);
  }
}

export { observedProxy as GET, observedProxy as POST, observedProxy as PUT, observedProxy as DELETE };
