import { Badge } from "@astryxdesign/core/Badge"
import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Table } from "@astryxdesign/core/Table"
import { TextInput } from "@astryxdesign/core/TextInput"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type AdminUser, roleNames } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { Exit } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useState } from "react"
import { ApiClient } from "../../client/ApiClient.ts"
import { AppTheme } from "../../components/AppTheme.tsx"
import { colors } from "../../styles/tokens.stylex.ts"
import type { AdminPanelProps } from "./AdminPanelProps.ts"

const usersKey = ["admin", "users"]

const usersAtom = Atom.family((search: string) =>
  ApiClient.query("admin", "listUsers", {
    query: search === "" ? {} : { search },
    reactivityKeys: usersKey,
  }),
)
const setRoleAtom = ApiClient.mutation("admin", "setRole")
const banAtom = ApiClient.mutation("admin", "banUser")
const unbanAtom = ApiClient.mutation("admin", "unbanUser")
const revokeAtom = ApiClient.mutation("admin", "revokeSessions")
const removeAtom = ApiClient.mutation("admin", "removeUser")

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" })

type Row = AdminUser & Record<string, unknown>

/** Lists accounts and applies admin actions through `AdminApi`. */
export default function UsersPanel({ user: me }: AdminPanelProps) {
  const [search, setSearch] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const users = useAtomValue(usersAtom(search.trim()))
  const setRole = useAtomSet(setRoleAtom, { mode: "promiseExit" })
  const ban = useAtomSet(banAtom, { mode: "promiseExit" })
  const unban = useAtomSet(unbanAtom, { mode: "promiseExit" })
  const revoke = useAtomSet(revokeAtom, { mode: "promiseExit" })
  const remove = useAtomSet(removeAtom, { mode: "promiseExit" })

  const act = async (
    id: string,
    label: string,
    run: () => Promise<Exit.Exit<unknown, unknown>>,
  ) => {
    setBusy(id)
    setMessage(null)
    const exit = await run()
    setBusy(null)
    setMessage(Exit.isSuccess(exit) ? `${label}.` : `Couldn’t complete: ${label.toLowerCase()}.`)
  }

  const params = (user: AdminUser) => ({ params: { id: user.id }, reactivityKeys: usersKey })

  return (
    <AppTheme>
      <div {...stylex.props(styles.panel)}>
        <TextInput
          label="Search by email"
          value={search}
          onChange={setSearch}
          hasClear
          width={320}
        />
        {message && (
          <p role="status" {...stylex.props(styles.message)}>
            {message}
          </p>
        )}
        {AsyncResult.match(users, {
          onInitial: () => <p {...stylex.props(styles.message)}>Loading users…</p>,
          onFailure: () => <Banner status="error" title="Users couldn’t be loaded." />,
          onSuccess: ({ value }) => (
            <>
              <p {...stylex.props(styles.message)}>
                {value.total} {value.total === 1 ? "account" : "accounts"}
              </p>
              <Table<Row>
                data={value.users as Row[]}
                idKey="id"
                density="balanced"
                columns={[
                  {
                    key: "name",
                    header: "User",
                    renderCell: (user) => (
                      <div>
                        <strong>{user.name}</strong>
                        <div {...stylex.props(styles.email)}>{user.email}</div>
                      </div>
                    ),
                  },
                  {
                    key: "role",
                    header: "Role",
                    renderCell: (user) => (
                      <div {...stylex.props(styles.badges)}>
                        <Badge
                          variant={user.role === "admin" ? "success" : "neutral"}
                          label={user.role}
                        />
                        {user.banned && <Badge variant="error" label="banned" />}
                      </div>
                    ),
                  },
                  {
                    key: "createdAt",
                    header: "Joined",
                    renderCell: (user) => dateFormat.format(user.createdAt),
                  },
                  {
                    key: "actions",
                    header: "Actions",
                    renderCell: (user) => {
                      const self = user.id === me.id
                      const disabled = busy !== null
                      const nextRole = roleNames.find((role) => role !== user.role) ?? "user"
                      return (
                        <div {...stylex.props(styles.actions)}>
                          <Button
                            size="sm"
                            label={`Make ${nextRole}`}
                            isDisabled={disabled || self}
                            onClick={() =>
                              void act(user.id, `Role set to ${nextRole}`, () =>
                                setRole({ ...params(user), payload: { role: nextRole } }),
                              )
                            }
                          />
                          <Button
                            size="sm"
                            label={user.banned ? "Unban" : "Ban"}
                            isDisabled={disabled || self}
                            onClick={() =>
                              void (user.banned
                                ? act(user.id, "User unbanned", () => unban(params(user)))
                                : act(user.id, "User banned", () =>
                                    ban({ ...params(user), payload: {} }),
                                  ))
                            }
                          />
                          <Button
                            size="sm"
                            label="Sign out everywhere"
                            isDisabled={disabled}
                            onClick={() =>
                              void act(user.id, "Sessions revoked", () => revoke(params(user)))
                            }
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            label="Delete"
                            isDisabled={disabled || self}
                            onClick={() => {
                              if (!window.confirm(`Delete ${user.email}? This can’t be undone.`))
                                return
                              void act(user.id, "User deleted", () => remove(params(user)))
                            }}
                          />
                        </div>
                      )
                    },
                  },
                ]}
              />
            </>
          ),
        })}
      </div>
    </AppTheme>
  )
}

const styles = stylex.create({
  panel: { display: "grid", gap: 16 },
  message: { margin: 0, fontSize: 13, color: colors.muted },
  email: { fontSize: 12, color: colors.muted },
  badges: { display: "flex", gap: 6, flexWrap: "wrap" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap" },
})
