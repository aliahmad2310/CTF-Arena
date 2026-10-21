from datetime import datetime, timezone
import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.rate_limit import limiter
from app.db.client import get_supabase_client
from app.models.common import HealthResponse, CtfStatusResponse
from app.routers import auth, teams, rooms, challenges, hints, leaderboard, dashboard, admin, admin_monitor

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("ctf-arena.api")

app = FastAPI(
    title="CTF Arena API",
    description="High-performance backend API powering the CTF Arena cybersecurity platform.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False
)

# Enable CORS for explicit origins and Vercel cloud domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=r"^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Log unexpected failures and return a generic response without leaking internals."""
    logger.exception("Unhandled API error for %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An unexpected server error occurred"},
    )

# Attach slowapi rate limiter to FastAPI state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Register API Routers
app.include_router(auth.router)
app.include_router(teams.router)
app.include_router(rooms.router)
app.include_router(challenges.router)
app.include_router(hints.router)
app.include_router(leaderboard.router)
app.include_router(dashboard.router)
app.include_router(admin.router)
app.include_router(admin_monitor.router)


@app.get("/health", response_model=HealthResponse, tags=["System"])
async def get_health():
    """
    Service health probe to verify API responsiveness and runtime configuration.
    """
    return HealthResponse(
        status="healthy",
        service="ctf-arena-api",
        environment=settings.ENV,
        timestamp=datetime.now(timezone.utc)
    )


from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "labs"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/storage/labs/{filename}", tags=["System"])
async def get_lab_storage_file(filename: str):
    """
    Serves stored lab attachment files directly from the backend file storage.
    """
    safe_filename = Path(filename).name
    file_path = STORAGE_DIR / safe_filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requested lab artifact not found in storage"
        )
    return FileResponse(file_path, filename=safe_filename)



@app.get("/ctf/status", response_model=CtfStatusResponse, tags=["Game State"])
async def get_ctf_status():
    """
    Public endpoint providing current competition configuration, timeline, and freeze status.
    """
    supabase = get_supabase_client()
    try:
        response = supabase.table("ctf_settings").select("*").eq("id", 1).limit(1).execute()
        if response.data and len(response.data) > 0:
            row = response.data[0]
            return CtfStatusResponse(
                id=row["id"],
                title=row["title"],
                start_time=row.get("start_time"),
                end_time=row.get("end_time"),
                is_active=row.get("is_active", True),
                freeze_leaderboard=row.get("freeze_leaderboard", False),
                dynamic_scoring=row.get("dynamic_scoring", False),
                max_team_size=row.get("max_team_size", 4),
                leaderboard_refresh_seconds=row.get("leaderboard_refresh_seconds", 15),
                server_time=datetime.now(timezone.utc)
            )
    except Exception as exc:
        logger.warning("Could not query ctf_settings table directly: %s. Returning default configuration.", str(exc))

    # Fallback to default configuration if database is unreachable or table not yet initialized
    return CtfStatusResponse(
        id=1,
        title="CTF Arena",
        start_time=None,
        end_time=None,
        is_active=True,
        freeze_leaderboard=False,
        dynamic_scoring=False,
        max_team_size=4,
        leaderboard_refresh_seconds=15,
        server_time=datetime.now(timezone.utc)
    )

