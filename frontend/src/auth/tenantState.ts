type TenantReset = () => void;

const resetters = new Set<TenantReset>();

export function registerTenantReset(reset: TenantReset) {
  resetters.add(reset);
  return () => resetters.delete(reset);
}

export function resetTenantScopedClientState() {
  for (const reset of resetters) {
    reset();
  }
}
