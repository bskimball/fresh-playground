import { Badge } from "@astryxdesign/core/Badge"
import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { Table } from "@astryxdesign/core/Table"
import { TextInput } from "@astryxdesign/core/TextInput"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type AdminUser, roleNames } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { Exit } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useState } from "react"
import { ApiClient } from "../../client/ApiClient.ts"
import { text } from "../../styles/text.ts"
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
    <Card xstyle={styles.card}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.searchWrap)}>
          <TextInput
            label="Search by email"
            placeholder="Filter members by email…"
            value={search}
            onChange={setSearch}
            hasClear
            width={320}
          />
        </div>
        {AsyncResult.isSuccess(users) && (
          <span {...stylex.props(styles.countPill, text.tabular)}>
            {users.value.total} {users.value.total === 1 ? "account" : "accounts"}
          </span>
        )}
      </div>

      {message && (
        <p role="status" {...stylex.props(styles.statusPill)}>
          {message}
        </p>
      )}

      {AsyncResult.match(users, {
        onInitial: () => <p {...stylex.props(styles.message)}>Loading users…</p>,
        onFailure: () => <Banner status="error" title="Users couldn’t be loaded." />,
        onSuccess: ({ value }) => (
          <Table<Row>
            data={value.users as Row[]}
            idKey="id"
            density="balanced"
            columns={[
              {
                key: "name",
                header: "User",
                renderCell: (user) => (
                  <div {...stylex.props(styles.userCell)}>
                    <strong {...stylex.props(styles.userName)}>{user.name}</strong>
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
                renderCell: (user) => (
                  <span {...stylex.props(styles.joinedDate, text.tabular)}>
                    {dateFormat.format(user.createdAt)}
                  </span>
                ),
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
                          if (!window.confirm(`Delete ${user.email}? This can’t be undone.`)) return
                          void act(user.id, "User deleted", () => remove(params(user)))
                        }}
                      />
                    </div>
                  )
                },
              },
            ]}
          />
        ),
      })}
    </Card>
  )
}

const styles = stylex.create({
  card: {
    display: "grid",
    gap: 18,
    paddingBlock: 24,
    paddingInline: 24,
    borderRadius: 20,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 14,
  },
  searchWrap: {
    minWidth: 0,
  },
  countPill: {
    display: "inline-flex",
    alignItems: "center",
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 12,
    fontWeight: 600,
    color: colors.ink,
  },
  statusPill: {
    margin: 0,
    justifySelf: "start",
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 12,
    fontWeight: 500,
    color: colors.ink,
  },
  message: { margin: 0, fontSize: 13, color: colors.muted },
  userCell: {
    display: "grid",
    gap: 2,
  },
  userName: {
    fontSize: 14,
    fontWeight: 600,
    color: colors.ink,
  },
  email: { fontSize: 12, color: colors.muted },
  joinedDate: {
    fontSize: 13,
    color: colors.muted,
  },
  badges: { display: "flex", gap: 6, flexWrap: "wrap" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap" },
})
