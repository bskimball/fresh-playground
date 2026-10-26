import { Banner } from "@astryxdesign/core/Banner"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { FileInput } from "@astryxdesign/core/FileInput"
import { pixel, proportional, Table } from "@astryxdesign/core/Table"
import { useAtomInitialValues, useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { FILE_MAX_BYTES, FILE_QUOTA_BYTES, fileHref, StoredFile } from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { Exit, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { ApiClient, seedAtom } from "../../client/ApiClient.ts"
import { defineIsland } from "../../client/hydrateIsland.ts"
import { schemaJsonCodec } from "../../machines/offlineSync.ts"
import { text } from "../../styles/text.ts"
import { colors } from "../../styles/tokens.stylex.ts"

const filesAtom = ApiClient.query("files", "list", {})
const uploadAtom = ApiClient.mutation("files", "upload")
const removeAtom = ApiClient.mutation("files", "remove")

export const FilesSnapshot = Schema.Struct({ files: Schema.Array(StoredFile) })
export type FilesSnapshot = typeof FilesSnapshot.Type

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" })
const units = ["byte", "kilobyte", "megabyte"] as const

const formatBytes = (bytes: number) => {
  const exponent = Math.min(
    units.length - 1,
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
  )
  return new Intl.NumberFormat("en", {
    style: "unit",
    unit: units[exponent],
    unitDisplay: "short",
    maximumFractionDigits: exponent === 0 ? 0 : 1,
  }).format(bytes / 1024 ** exponent)
}

type Row = StoredFile & Record<string, unknown>

/** Uploads, lists, and deletes the signed-in user's files through `FilesApi`. */
function FilesIsland(initial: FilesSnapshot) {
  useAtomInitialValues([seedAtom(filesAtom, initial.files)])
  const files = useAtomValue(filesAtom)
  // A seeded atom has not run its query yet, so mutations refresh it explicitly.
  const refresh = useAtomRefresh(filesAtom)
  const upload = useAtomSet(uploadAtom, { mode: "promiseExit" })
  const remove = useAtomSet(removeAtom, { mode: "promiseExit" })
  const [selected, setSelected] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const send = async (file: File) => {
    setBusy(true)
    setMessage(null)
    const payload = new FormData()
    payload.append("file", file)
    const exit = await upload({ payload })
    if (Exit.isSuccess(exit)) refresh()
    setBusy(false)
    setSelected(null)
    setMessage(
      Exit.isSuccess(exit)
        ? `Uploaded ${file.name}.`
        : `Couldn’t upload ${file.name}. Files must be ${formatBytes(FILE_MAX_BYTES)} or smaller and fit your ${formatBytes(FILE_QUOTA_BYTES)} quota.`,
    )
  }

  const onDelete = async (file: StoredFile) => {
    if (!window.confirm(`Delete ${file.name}? This can’t be undone.`)) return
    setBusy(true)
    setMessage(null)
    const exit = await remove({ params: { id: file.id } })
    if (Exit.isSuccess(exit)) refresh()
    setBusy(false)
    setMessage(Exit.isSuccess(exit) ? `Deleted ${file.name}.` : `Couldn’t delete ${file.name}.`)
  }

  const used = AsyncResult.isSuccess(files)
    ? files.value.reduce((total, file) => total + file.size, 0)
    : 0

  return (
    <Card xstyle={styles.card}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.input)}>
          <FileInput
            label="Upload a file"
            description={`Up to ${formatBytes(FILE_MAX_BYTES)}.`}
            value={selected}
            maxSize={FILE_MAX_BYTES}
            isLoading={busy}
            isDisabled={busy}
            onChange={(next) => {
              const file = Array.isArray(next) ? (next[0] ?? null) : next
              setSelected(file)
              if (file !== null && file.size <= FILE_MAX_BYTES) void send(file)
            }}
          />
        </div>
        <span {...stylex.props(styles.pill, text.tabular)}>
          {formatBytes(used)} of {formatBytes(FILE_QUOTA_BYTES)} used
        </span>
      </div>

      {message && (
        <p role="status" {...stylex.props(styles.pill, styles.status)}>
          {message}
        </p>
      )}

      {AsyncResult.match(files, {
        onInitial: () => <p {...stylex.props(styles.muted)}>Loading files…</p>,
        onFailure: () => <Banner status="error" title="Files couldn’t be loaded." />,
        onSuccess: ({ value }) =>
          value.length === 0 ? (
            <p {...stylex.props(styles.muted)}>No files yet.</p>
          ) : (
            <Table<Row>
              data={value as Row[]}
              idKey="id"
              density="balanced"
              columns={[
                {
                  key: "name",
                  width: proportional(2, { minWidth: 140 }),
                  header: "Name",
                  renderCell: (file) => (
                    <a href={fileHref(file.id)} {...stylex.props(styles.link)}>
                      {file.name}
                    </a>
                  ),
                },
                {
                  key: "size",
                  width: pixel(96),
                  header: "Size",
                  renderCell: (file) => (
                    <span {...stylex.props(styles.muted, text.tabular)}>
                      {formatBytes(file.size)}
                    </span>
                  ),
                },
                {
                  key: "createdAt",
                  width: proportional(1, { minWidth: 168 }),
                  header: "Uploaded",
                  renderCell: (file) => (
                    <span {...stylex.props(styles.muted, text.tabular)}>
                      {dateFormat.format(file.createdAt)}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  width: pixel(104),
                  header: "Actions",
                  renderCell: (file) => (
                    <Button
                      size="sm"
                      variant="destructive"
                      label="Delete"
                      isDisabled={busy}
                      onClick={() => void onDelete(file)}
                    />
                  ),
                },
              ]}
            />
          ),
      })}
    </Card>
  )
}

export const filesIsland = defineIsland("files", FilesIsland, {
  codec: schemaJsonCodec(FilesSnapshot),
})

const styles = stylex.create({
  card: {
    display: "grid",
    // Lets the table scroll inside the card instead of widening the page.
    gridTemplateColumns: "minmax(0, 1fr)",
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
  input: { flexGrow: 1, minWidth: 0, maxWidth: 420 },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    margin: 0,
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
  status: { justifySelf: "start", backgroundColor: colors.surfaceTint, fontWeight: 500 },
  muted: { margin: 0, fontSize: 13, color: colors.muted },
  link: { fontWeight: 600, color: colors.mossDark, overflowWrap: "anywhere" },
})
