from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable

import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import InvalidTokenError, PyJWKClient

from config import settings


class Permission:
    SCREENINGS_CREATE = "org:screenings:create"
    SCREENINGS_READ = "org:screenings:read"
    REPORTS_EXPORT = "org:reports:export"
    TIER2_CREATE = "org:tier2:create"
    SETTINGS_MANAGE = "org:settings:manage"


ROLE_PERMISSION_DEFAULTS: dict[str, set[str]] = {
    "org:admin": {"*"},
    "org:compliance_manager": {
        Permission.SCREENINGS_CREATE,
        Permission.SCREENINGS_READ,
        Permission.REPORTS_EXPORT,
        Permission.TIER2_CREATE,
    },
    "org:manager": {
        Permission.SCREENINGS_CREATE,
        Permission.SCREENINGS_READ,
        Permission.REPORTS_EXPORT,
        Permission.TIER2_CREATE,
    },
    "org:analyst": {
        Permission.SCREENINGS_CREATE,
        Permission.SCREENINGS_READ,
        Permission.TIER2_CREATE,
    },
    "org:member": {
        Permission.SCREENINGS_CREATE,
        Permission.SCREENINGS_READ,
        Permission.TIER2_CREATE,
    },
    "org:viewer": {
        Permission.SCREENINGS_READ,
    },
    "org:auditor": {
        Permission.SCREENINGS_READ,
        Permission.REPORTS_EXPORT,
    },
}


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    org_id: str
    session_id: str | None = None
    org_slug: str | None = None
    org_role: str | None = None
    org_permissions: tuple[str, ...] = ()
    claims: dict[str, Any] | None = None

    def has_permission(self, permission: str) -> bool:
        if permission in self.org_permissions:
            return True

        role_permissions = ROLE_PERMISSION_DEFAULTS.get(self.org_role or "", set())
        return "*" in role_permissions or permission in role_permissions


def _csv_values(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _normalize_permissions(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        delimiters = [",", " "]
        values = [value]
        for delimiter in delimiters:
            if delimiter in value:
                values = value.split(delimiter)
                break
        return tuple(item.strip() for item in values if item.strip())

    if isinstance(value, list):
        return tuple(str(item).strip() for item in value if str(item).strip())

    return ()


def _normalize_role(value: Any) -> str | None:
    role = str(value).strip() if value else ""
    if not role:
        return None
    # Clerk v2 session tokens store the role in `o.rol` without the `org:`
    # prefix ("admin"), while v1 `org_role` claims include it ("org:admin").
    if not role.startswith("org:"):
        role = f"org:{role}"
    return role


def _extract_org_claims(claims: dict[str, Any]) -> tuple[str | None, str | None, str | None, tuple[str, ...]]:
    org_claim = claims.get("o") if isinstance(claims.get("o"), dict) else {}
    org_id = claims.get("org_id") or org_claim.get("id")
    org_slug = claims.get("org_slug") or org_claim.get("slg")
    org_role = _normalize_role(claims.get("org_role") or org_claim.get("rol"))
    org_permissions = _normalize_permissions(
        claims.get("org_permissions")
        or org_claim.get("per")
        or org_claim.get("permissions")
        or []
    )
    return org_id, org_slug, org_role, org_permissions


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization bearer token.",
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Authorization bearer token.",
        )
    return token


def _clerk_issuer() -> str:
    issuer = settings.clerk_issuer.strip().rstrip("/")
    if not issuer:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_ISSUER is not configured on the API.",
        )
    return issuer


def _jwks_url() -> str:
    explicit = settings.clerk_jwks_url.strip()
    if explicit:
        return explicit
    return f"{_clerk_issuer()}/.well-known/jwks.json"


@lru_cache(maxsize=1)
def _jwk_client() -> PyJWKClient:
    return PyJWKClient(_jwks_url())


def _decode_token(token: str) -> dict[str, Any]:
    issuer = _clerk_issuer()
    jwt_key = settings.clerk_jwt_key.strip().replace("\\n", "\n")
    audience = settings.clerk_audience.strip() or None
    decode_kwargs: dict[str, Any] = {
        "algorithms": ["RS256"],
        "issuer": issuer,
        "options": {"verify_aud": bool(audience)},
    }
    if audience:
        decode_kwargs["audience"] = audience

    try:
        if jwt_key:
            claims = jwt.decode(token, jwt_key, **decode_kwargs)
        else:
            signing_key = _jwk_client().get_signing_key_from_jwt(token)
            claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Clerk session token.",
        ) from exc

    authorized_parties = _csv_values(settings.clerk_authorized_parties)
    if authorized_parties:
        azp = claims.get("azp")
        if azp not in authorized_parties:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Clerk session token is not authorized for this application.",
            )

    return claims


def require_auth_context(authorization: str | None = Header(default=None)) -> AuthContext:
    token = _bearer_token(authorization)
    claims = _decode_token(token)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Clerk session token is missing a user id.",
        )

    org_id, org_slug, org_role, org_permissions = _extract_org_claims(claims)
    if settings.clerk_require_organization and not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Select an organization before using this workspace.",
        )

    return AuthContext(
        user_id=str(user_id),
        org_id=str(org_id or user_id),
        session_id=str(claims.get("sid")) if claims.get("sid") else None,
        org_slug=str(org_slug) if org_slug else None,
        org_role=str(org_role) if org_role else None,
        org_permissions=org_permissions,
        claims=claims,
    )


def require_permission(permission: str) -> Callable[[AuthContext], AuthContext]:
    def dependency(auth: AuthContext = Depends(require_auth_context)) -> AuthContext:
        if not auth.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission}",
            )
        return auth

    return dependency
