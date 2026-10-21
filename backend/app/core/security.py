import hmac
import hashlib
import jwt
from jwt import PyJWKClient
from typing import Dict, Any
from fastapi import HTTPException, status
from app.core.config import settings


def verify_supabase_jwt(token: str) -> Dict[str, Any]:
    """
    Validates a Supabase-issued Bearer JWT using the project's JWKS or legacy
    HS256 secret, and checks signature, expiration, issuer, and audience.
    """
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")

        if algorithm == "HS256":
            # Legacy Supabase projects use the shared JWT secret.
            signing_key = settings.SUPABASE_JWT_SECRET
        elif algorithm in {"ES256", "RS256", "EdDSA"}:
            # Newer Supabase projects can use asymmetric signing keys. Resolve
            # the key only from this configured project's public JWKS endpoint.
            jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
            signing_key = PyJWKClient(jwks_url, cache_keys=True, timeout=5).get_signing_key_from_jwt(token).key
            if header.get("alg") is None:
                raise jwt.InvalidTokenError("Missing signing algorithm")
        else:
            raise jwt.InvalidAlgorithmError("Unsupported Supabase JWT signing algorithm")

        issuer = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1"
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[algorithm],
            audience="authenticated",
            issuer=issuer,
            options={
                "verify_signature": True,
                "verify_exp": True,
                "verify_aud": True,
                "verify_iss": True,
                "require": ["exp", "sub", "aud", "iss"]
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
    except HTTPException:
        raise
    except Exception as exc:
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
