import { createAccessControl, type Role } from "better-auth/plugins/access"
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access"

/**
 * Every resource and action an app grants. Better Auth's admin plugin owns
 * `user` and `session`; add app resources here, then grant them per role.
 */
export const statements = {
  ...defaultStatements,
  garden: ["reset"],
} as const

export const ac = createAccessControl(statements)

export const roles = {
  admin: ac.newRole({ ...adminAc.statements, garden: ["reset"] }),
  user: ac.newRole({ user: [], session: [] }),
} satisfies Record<string, Role>

export type RoleName = keyof typeof roles
export const roleNames = Object.keys(roles) as ReadonlyArray<RoleName>

export type Permissions = {
  readonly [K in keyof typeof statements]?: ReadonlyArray<(typeof statements)[K][number]>
}

/** Better Auth stores multiple roles as a comma-separated string. */
export const can = (role: string | null | undefined, permissions: Permissions) =>
  (role ?? "user")
    .split(",")
    .some(
      (name) =>
        roles[name.trim() as RoleName]?.authorize(
          permissions as Parameters<(typeof roles)["admin"]["authorize"]>[0],
        ).success === true,
    )
