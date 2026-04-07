import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.logger import get_logger
from app.metrics import http_request_duration_seconds, http_requests_total

logger = get_logger("middleware")

# Endpoints we don't want to pollute metrics with (health checks, etc.)
_SKIP_METRICS_PATHS = {"/health", "/metrics", "/docs", "/redoc", "/openapi.json"}


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Inject a unique X-Request-ID into every request/response cycle, log timing,
    and record Prometheus HTTP metrics.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        elapsed = time.perf_counter() - start

        response.headers["X-Request-ID"] = request_id

        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(elapsed * 1000, 2),
            request_id=request_id,
        )

        # Record Prometheus metrics (skip noisy infra paths)
        if request.url.path not in _SKIP_METRICS_PATHS:
            # Normalise dynamic path segments so /datasets/abc and /datasets/xyz
            # roll up to the same label instead of creating unbounded cardinality.
            endpoint = _normalise_path(request.url.path)
            http_requests_total.labels(
                method=request.method,
                endpoint=endpoint,
                status_code=str(response.status_code),
            ).inc()
            http_request_duration_seconds.labels(
                method=request.method,
                endpoint=endpoint,
            ).observe(elapsed)

        return response


def _normalise_path(path: str) -> str:
    """
    Replace UUID-like and numeric path segments with placeholders so Prometheus
    doesn't create a new label series per resource ID.

    Examples:
      /datasets/abc123 → /datasets/{id}
      /threads/550e8400-e29b.../messages → /threads/{id}/messages
    """
    import re

    # UUID
    path = re.sub(
        r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
        "{id}",
        path,
        flags=re.IGNORECASE,
    )
    # Numeric IDs
    path = re.sub(r"/\d+", "/{id}", path)
    return path
