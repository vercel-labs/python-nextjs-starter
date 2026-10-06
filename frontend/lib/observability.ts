import "server-only";
import { randomUUID } from "node:crypto";
import { createLogger, initLogger } from "evlog";

initLogger({
  env: {
    service: "bookstore-frontend",
    environment: process.env.VERCEL_ENV ?? "development",
    region: process.env.VERCEL_REGION,
    commitHash: process.env.VERCEL_GIT_COMMIT_SHA,
  },
  pretty: false,
  redact: true,
});

// Only known route templates enter logs; exclude query strings and arbitrary IDs.
export function backendRoute(path: string) {
  const route = path.split("?")[0];
  if (/^\/(books|shelf)\/[a-zA-Z0-9-]{1,36}$/.test(route))
    return `/${route.split("/")[1]}/{book_id}`;
  return /^\/(books|shelf|health|auth\/(me|login|logout|register))$/.test(route)
    ? route
    : "unmatched";
}

export function requestEvent(requestId: string, method: string, route: string, event: string) {
  return createLogger({
    event, requestId, method, route,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID,
  });
}

export function finishEvent(log: ReturnType<typeof requestEvent>, status: number, start: number) {
  log.setLevel(status >= 500 ? "error" : status >= 400 ? "warn" : "info");
  log.emit({ status, durationMs: Math.round(performance.now() - start) });
}

// A call ID distinguishes parallel Python calls sharing the same operation.
export async function fetchBackend(path: string, options: RequestInit = {}, requestId: string = randomUUID()) {
  const base = process.env.BACKEND_URL;
  const callId = randomUUID();
  const log = requestEvent(requestId, options.method ?? "GET", backendRoute(path), "backend_call");
  log.set({ callId });
  const start = performance.now();
  let status = 503;
  try {
    if (!base) throw new Error("Backend service binding is unavailable.");
    const headers = new Headers(options.headers);
    headers.set("x-request-id", requestId);
    headers.set("x-call-id", callId);
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      ...options, headers, cache: "no-store", redirect: "manual",
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
    status = response.status;
    return response;
  } catch {
    // Fetch errors can contain private service URLs. Record a fixed category.
    log.set({ failure: base ? "backend_transport" : "missing_binding" });
    throw new Error("Could not reach the bookstore backend.");
  } finally {
    finishEvent(log, status, start);
  }
}
