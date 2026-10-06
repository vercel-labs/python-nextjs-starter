"""Request summaries with explicit safe fields and async request isolation."""
import os
import re
import sys
import time
from uuid import uuid4

import structlog
from starlette.responses import JSONResponse

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.JSONRenderer(),
    ],
    logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
    cache_logger_on_first_use=True,
)
log = structlog.get_logger()
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
ROUTES = {"/health", "/books", "/shelf", "/auth/me", "/auth/register", "/auth/login", "/auth/logout", "/books/{book_id}", "/shelf/{book_id}"}


def identifier(value):
    return value if value and UUID.fullmatch(value) else str(uuid4())


class RequestLoggingMiddleware:
    """Pure ASGI middleware: capture response status without buffering the body."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        request_id = identifier(headers.get(b"x-request-id", b"").decode("latin1"))
        call_id = identifier(headers.get(b"x-call-id", b"").decode("latin1"))
        # Clear before binding and restore after: concurrent ASGI requests never
        # inherit each other's context. Sync FastAPI handlers read copied context.
        previous = structlog.contextvars.get_contextvars()
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            requestId=request_id, callId=call_id,
            service="bookstore-backend", environment=os.getenv("VERCEL_ENV", "development"),
            deploymentId=os.getenv("VERCEL_DEPLOYMENT_ID"), region=os.getenv("VERCEL_REGION"),
        )
        started = time.perf_counter()
        status = 500
        response_started = False
        error_type = None

        async def observed_send(message):
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status = message["status"]
                response_started = True
                outgoing = [(key, value) for key, value in message.get("headers", []) if key.lower() != b"x-request-id"]
                message = {**message, "headers": [*outgoing, (b"x-request-id", request_id.encode("ascii"))]}
            await send(message)

        try:
            await self.app(scope, receive, observed_send)
        except Exception as error:
            # Database/validation exception strings can contain secrets or input.
            error_type = type(error).__name__
            status = 500
            if response_started:
                raise
            await JSONResponse({"detail": "The bookstore is temporarily unavailable."}, status_code=500)(scope, receive, observed_send)
        finally:
            route = getattr(scope.get("route"), "path", "unmatched")
            fields = {
                "method": scope["method"], "route": route if route in ROUTES else "unmatched",
                "status": status, "durationMs": round((time.perf_counter() - started) * 1000),
            }
            if error_type:
                fields["errorType"] = error_type
            emit = log.error if status >= 500 else log.warning if status >= 400 else log.info
            try:
                emit("api_request", **fields)
            finally:
                structlog.contextvars.clear_contextvars()
                structlog.contextvars.bind_contextvars(**previous)
