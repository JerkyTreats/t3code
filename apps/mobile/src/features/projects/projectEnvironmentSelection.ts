import type { EnvironmentId } from "@t3tools/contracts";

export function resolveProjectEnvironmentFromParam<
  Environment extends { readonly environmentId: EnvironmentId },
>(
  environments: ReadonlyArray<Environment>,
  environmentIdParam: string | string[] | undefined,
): Environment | null {
  const environmentId = Array.isArray(environmentIdParam)
    ? (environmentIdParam[0] ?? null)
    : (environmentIdParam ?? null);
  if (environmentId === null) {
    return environments[0] ?? null;
  }
  return environments.find((environment) => environment.environmentId === environmentId) ?? null;
}
