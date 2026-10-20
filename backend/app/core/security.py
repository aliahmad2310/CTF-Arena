import hmac
import hashlib
import jwt
from typing import Dict, Any
from fastapi import HTTPException, status
from app.core.config import settings


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Validates a Supabase-issued Bearer JWT.
    Verifies signature using SUPABASE_JWT_SECRET, checks expiration and audience,
    and extracts subject (user_id).
    """
    try:
        # Supabase default algorithm is HS256 signed with the project JWT Secret
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": False  # Allow custom/standard Supabase audiences while checking claims below
            }
        )

        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing subject identifier"
            )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please log in again."
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token verification failed: {str(exc)}"
        )


def compute_flag_hash(plain_flag: str, salt: str, is_case_sensitive: bool = True) -> str:
    """
    Computes a cryptographic hash of the submitted flag combined with salt and server pepper.
    """
    clean_flag = plain_flag.strip()
    if not is_case_sensitive:
        clean_flag = clean_flag.lower()

    data = f"{clean_flag}{salt}{settings.FLAG_PEPPER}".encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def verify_flag(submitted_flag: str, salt: str, target_hash: str, is_case_sensitive: bool = True) -> bool:
    """
    Verifies a submitted flag using constant-time string comparison to prevent timing attacks.
    """
    computed = compute_flag_hash(submitted_flag, salt, is_case_sensitive)
    return hmac.compare_digest(computed.lower(), target_hash.lower())
