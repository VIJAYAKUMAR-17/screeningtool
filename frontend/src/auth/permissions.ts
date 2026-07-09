import { useAuth } from "@clerk/react";

export const permissions = {
  screeningsCreate: "org:screenings:create",
  screeningsRead: "org:screenings:read",
  reportsExport: "org:reports:export",
  tier2Create: "org:tier2:create",
  settingsManage: "org:settings:manage",
} as const;

const rolePermissionDefaults: Record<string, Set<string>> = {
  "org:admin": new Set(["*"]),
  "org:compliance_manager": new Set([
    permissions.screeningsCreate,
    permissions.screeningsRead,
    permissions.reportsExport,
    permissions.tier2Create,
  ]),
  "org:manager": new Set([
    permissions.screeningsCreate,
    permissions.screeningsRead,
    permissions.reportsExport,
    permissions.tier2Create,
  ]),
  "org:analyst": new Set([
    permissions.screeningsCreate,
    permissions.screeningsRead,
    permissions.tier2Create,
  ]),
  "org:member": new Set([
    permissions.screeningsCreate,
    permissions.screeningsRead,
    permissions.tier2Create,
  ]),
  "org:viewer": new Set([permissions.screeningsRead]),
  "org:auditor": new Set([permissions.screeningsRead, permissions.reportsExport]),
};

type ClerkAuthWithPermissions = ReturnType<typeof useAuth> & {
  has?: (params: { permission?: string; role?: string }) => boolean;
  orgPermissions?: string[];
};

export function useCan(permission: string) {
  const auth = useAuth() as ClerkAuthWithPermissions;
  if (typeof auth.has === "function" && auth.has({ permission })) {
    return true;
  }

  const explicitPermissions = new Set(auth.orgPermissions ?? []);
  const rolePermissions = rolePermissionDefaults[auth.orgRole ?? ""] ?? new Set<string>();

  return explicitPermissions.has(permission) || rolePermissions.has("*") || rolePermissions.has(permission);
}
