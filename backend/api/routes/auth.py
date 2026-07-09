from fastapi import APIRouter, Depends

from auth import AuthContext, ROLE_PERMISSION_DEFAULTS, require_auth_context

router = APIRouter()


@router.get("/me")
def current_auth_context(auth: AuthContext = Depends(require_auth_context)):
    role_permissions = ROLE_PERMISSION_DEFAULTS.get(auth.org_role or "", set())
    effective_permissions = set(auth.org_permissions)
    if "*" in role_permissions:
        effective_permissions.update(
            permission
            for permissions in ROLE_PERMISSION_DEFAULTS.values()
            for permission in permissions
            if permission != "*"
        )
    else:
        effective_permissions.update(role_permissions)

    return {
        "user_id": auth.user_id,
        "org_id": auth.org_id,
        "org_slug": auth.org_slug,
        "org_role": auth.org_role,
        "org_permissions": sorted(effective_permissions),
    }
