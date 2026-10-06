import asyncio
from types import SimpleNamespace
from uuid import UUID

import structlog

from app import observability
from app.observability import RequestLoggingMiddleware


class Capture:
    def __init__(self):
        self.events = []

    def info(self, event, **fields):
        self.events.append({**structlog.contextvars.get_contextvars(), "event": event, **fields})

    warning = error = info


def test_concurrent_requests_keep_correlation_and_do_not_log_input(monkeypatch):
    capture = Capture()
    monkeypatch.setattr(observability, "log", capture)

    async def handler(scope, receive, send):
        await asyncio.sleep(0.01 if scope["headers"][0][1].startswith(b"a") else 0)
        scope["route"] = SimpleNamespace(path="/auth/login")
        await send({"type": "http.response.start", "status": 401, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    async def exercise():
        async def request(prefix):
            request_id = f"{prefix * 8}-1111-4111-8111-111111111111"
            call_id = f"{prefix * 8}-2222-4222-8222-222222222222"
            messages = []

            async def send(message):
                messages.append(message)

            scope = {"type": "http", "method": "POST", "path": "/auth/login", "query_string": b"email=private@example.com", "headers": [
                (b"x-request-id", request_id.encode()), (b"x-call-id", call_id.encode()),
                (b"cookie", b"private-session"), (b"authorization", b"Bearer private-token"),
            ]}
            await RequestLoggingMiddleware(handler)(scope, None, send)
            assert dict(messages[0]["headers"])[b"x-request-id"] == request_id.encode()
            return request_id, call_id

        expected = await asyncio.gather(request("a"), request("b"))
        assert {(event["requestId"], event["callId"]) for event in capture.events} == set(expected)
        assert structlog.contextvars.get_contextvars() == {}

    asyncio.run(exercise())
    assert all(event["status"] == 401 and event["route"] == "/auth/login" for event in capture.events)
    assert "private" not in str(capture.events)


def test_unhandled_error_has_safe_response_and_new_ids(monkeypatch):
    capture = Capture()
    monkeypatch.setattr(observability, "log", capture)

    async def handler(scope, receive, send):
        raise RuntimeError("postgresql://secret:password@private-host/db")

    async def exercise():
        messages = []

        async def send(message):
            messages.append(message)

        scope = {"type": "http", "method": "GET", "headers": [(b"x-request-id", b"invalid\nvalue")], "path": "/private"}
        await RequestLoggingMiddleware(handler)(scope, None, send)
        assert messages[0]["status"] == 500
        UUID(dict(messages[0]["headers"])[b"x-request-id"].decode())
        assert b"secret" not in messages[1]["body"]

    asyncio.run(exercise())
    event = capture.events[0]
    UUID(event["requestId"])
    UUID(event["callId"])
    assert event["errorType"] == "RuntimeError" and event["route"] == "unmatched"
    assert "secret" not in str(event)
