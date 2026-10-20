import logging
from typing import Optional
from supabase import create_client, Client
from app.core.config import settings

logger = logging.getLogger("ctf-arena.db")

_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """
    Returns the Supabase database and storage client instantiated with service_role privileges.
    Bypasses RLS to execute backend game engine logic securely.
    """
    global _supabase_client
    if _supabase_client is None:
        try:
            _supabase_client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_SERVICE_ROLE_KEY
            )
            logger.info("Supabase client initialized successfully with service_role credentials.")
        except Exception as exc:
            logger.error("Failed to initialize Supabase client: %s", str(exc))
            raise exc
    return _supabase_client
