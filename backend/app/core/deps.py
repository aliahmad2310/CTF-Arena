from typing import Optional, Dict, Any
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import verify_supabase_jwt
from app.db.client import get_supabase_client

security_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Dict[str, Any]:
    """
    FastAPI dependency validating the Supabase Bearer token and fetching the verified
    user profile from the database. Prevents spoofing by reading role and status directly from DB.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header or Bearer token"
        )

    payload = verify_supabase_jwt(credentials.credentials)
    user_id = payload["sub"]

    supabase = get_supabase_client()
    try:
        response = supabase.table("profiles").select("*").eq("id", user_id).limit(1).execute()
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found in database"
            )
        user = response.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query error during profile verification: {str(exc)}"
        )

    if user.get("is_banned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been suspended by system administrator"
        )

    # Attach token payload for downstream consumption if needed
    user["jwt_payload"] = payload
    return user


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme)
) -> Optional[Dict[str, Any]]:
    """
    Optional user dependency allowing endpoints to deliver enhanced data for authenticated users
    while remaining accessible to unauthenticated guests.
    """
    if not credentials or not credentials.credentials:
        return None
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


async def require_admin(
    current_user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    FastAPI dependency ensuring the requesting user possesses administrative privileges.
    Role is strictly verified against public.profiles.role in PostgreSQL.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privilege required to access this resource"
        )
    return current_user
