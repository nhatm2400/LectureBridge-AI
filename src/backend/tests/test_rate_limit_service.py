from starlette.requests import Request

from src.backend.services.rate_limit_service import _client_key


def test_rate_limit_does_not_trust_forwarded_for_from_client():
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [(b"x-forwarded-for", b"203.0.113.99")],
            "client": ("127.0.0.1", 50000),
            "server": ("testserver", 80),
            "scheme": "http",
            "query_string": b"",
        }
    )

    assert _client_key(request, "login") == "login:127.0.0.1"
