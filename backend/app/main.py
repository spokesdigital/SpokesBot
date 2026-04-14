from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.dependencies import get_service_client
from app.logger import get_logger, setup_logger
from app.middlewares import CorrelationIdMiddleware

# Initialize structured logging
setup_logger()
logger = get_logger("app.main")

# Initialize limiter with a temporary key_func to avoid circular import issues during import
limiter = Limiter(key_func=get_remote_address)

# Import routers after limiter is initialized to avoid circular imports
from app.routers import (  # noqa: E402
    analytics,
    auth,
    datasets,
    events,
    organizations,
    support,
    threads,
    upload,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup: log active configuration to catch deployment misconfiguration ─
    effective_origins = list({
        "https://spokesbot.vercel.app",
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    })
    logger.info(
        "startup_config",
        environment=settings.ENVIRONMENT,
        frontend_url=settings.FRONTEND_URL,
        allowed_cors_origins=effective_origins,
        message=(
            "CORS configured. If 'Failed to fetch' errors appear in production, "
            "verify FRONTEND_URL matches the deployed frontend domain exactly."
        ),
    )

    # ── Startup: recover jobs lost to a mid-processing crash ─────────────────
    # Any dataset stuck in "processing" when the server starts will never
    # advance on its own — the background task that was running it is gone.
    # Reset them to "failed" so the UI surfaces the error instead of spinning.
    service_client = get_service_client()
    service_client.table("datasets").update({
        "status": "failed",
        "error_message": "Server restarted while this dataset was being processed. Please re-upload.",
    }).eq("status", "processing").execute()
    logger.info("startup_recovery", message="Reset stuck processing datasets to failed")
    yield


from slowapi.errors import RateLimitExceeded  # noqa: E402
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402

app = FastAPI(
    title="SpokesBot API",
    description="Backend API for SpokesBot - AI Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"}))

# ── Middleware stack (order matters: first added = last executed) ────────────
# 1. Correlation ID + timing (outermost — captures full request lifecycle)
app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(SlowAPIMiddleware)

# 2. Stricter CORS — explicit methods, no wildcard headers
_CORS_ORIGINS = list({
    "https://spokesbot.vercel.app",  # production — always allowed
    settings.FRONTEND_URL,           # picks up any override set in Render dashboard
    "http://localhost:3000",
    "http://127.0.0.1:3000",
})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",  # support Vercel preview deployments
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    max_age=600,  # Cache preflight for 10 minutes
)

# ── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(organizations.router)
app.include_router(upload.router)
app.include_router(datasets.router)
app.include_router(threads.router)
app.include_router(analytics.router)
app.include_router(events.router)
app.include_router(support.router)

# ── Global exception handler ─────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "unhandled_exception",
        error=str(exc),
        error_type=type(exc).__name__,
        path=request.url.path,
        method=request.method,
    )
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )

# ── System endpoints ─────────────────────────────────────────────────────────
@app.get("/health", tags=["system"], summary="Health check")
def health():
    """Returns service status and version. Used by load balancers and uptime monitors."""
    return {"status": "ok", "version": app.version, "environment": settings.ENVIRONMENT, "frontend_url": settings.FRONTEND_URL}


@app.get(
    "/metrics",
    tags=["system"],
    summary="Prometheus metrics",
    include_in_schema=not settings.is_production,  # hide from public Swagger in prod
)
def metrics():
    """Exposes Prometheus-format metrics for scraping by a Prometheus server or Grafana agent."""
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
