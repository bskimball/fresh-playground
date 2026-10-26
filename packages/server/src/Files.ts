import { randomUUID } from "node:crypto"
import { stat } from "node:fs/promises"
import {
  AppApi,
  CurrentUser,
  FILE_NAME_MAX,
  FILE_QUOTA_BYTES,
  FILES_PATH,
  type StoredFile,
} from "@playground/contract"
import { Clock, Context, Effect, Layer, Option, Stream } from "effect"
import { HttpRouter, HttpServerResponse, type Multipart } from "effect/http"
import { HttpApiBuilder, HttpApiError } from "effect/http-api"
import { Auth, webHeaders } from "./Auth.ts"
import { Sqlite } from "./Sqlite.ts"
import { Storage } from "./Storage.ts"

/** Served inline; everything else downloads as an attachment. */
const inlineTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"])

const mediaType = (declared: string) => {
  const type = declared.split(";", 1)[0]!.trim().toLowerCase()
  return /^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/.test(type) ? type : "application/octet-stream"
}

/** Browsers send a base name; older ones and other clients may send a path. */
const fileName = (declared: string) => {
  const base = declared.split(/[\\/]/).pop()?.trim() ?? ""
  const printable = Array.from(base).filter((char) => char >= " " && char !== "\u007f")
  return printable.slice(0, FILE_NAME_MAX).join("") || "upload"
}

/** RFC 6266 with an ASCII fallback, so names cannot inject header parameters. */
const contentDisposition = (type: "inline" | "attachment", name: string) => {
  const fallback = name.replaceAll(/[^\x20-\x7e]|["\\%]/g, "_")
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

interface FileRow {
  readonly id: string
  readonly name: string
  readonly content_type: string
  readonly size: number
  readonly created_at: number
}

const toStoredFile = (row: FileRow): StoredFile => ({
  id: row.id,
  name: row.name,
  contentType: row.content_type,
  size: row.size,
  createdAt: new Date(row.created_at),
})

/** Per-user uploads: metadata in SQLite, bytes in `Storage` under the file's id. */
export class Files extends Context.Service<
  Files,
  {
    readonly list: (ownerId: string) => Effect.Effect<ReadonlyArray<StoredFile>>
    readonly upload: (
      ownerId: string,
      file: Multipart.PersistedFile,
    ) => Effect.Effect<StoredFile, HttpApiError.Conflict>
    readonly open: (
      ownerId: string,
      id: string,
    ) => Effect.Effect<
      Option.Option<{ readonly file: StoredFile; readonly body: ReadableStream<Uint8Array> }>
    >
    readonly remove: (ownerId: string, id: string) => Effect.Effect<void, HttpApiError.NotFound>
  }
>()("server/Files") {
  static readonly layer = Layer.effect(
    Files,
    Effect.gen(function* () {
      const db = yield* Sqlite
      const storage = yield* Storage
      Sqlite.migrate(db, "files", [
        `
        CREATE TABLE IF NOT EXISTS files (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          name TEXT NOT NULL,
          content_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS files_owner ON files (owner_id, created_at DESC);
        `,
      ])
      const columns = "id, name, content_type, size, created_at"
      const selectOwned = db.prepare(
        `SELECT ${columns} FROM files WHERE owner_id = ? ORDER BY created_at DESC, id`,
      )
      const selectOne = db.prepare(`SELECT ${columns} FROM files WHERE owner_id = ? AND id = ?`)
      const usedBytes = db.prepare(
        "SELECT COALESCE(SUM(size), 0) AS used FROM files WHERE owner_id = ?",
      )
      const insert = db.prepare(
        "INSERT INTO files (id, owner_id, name, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      const deleteOne = db.prepare("DELETE FROM files WHERE owner_id = ? AND id = ?")

      const list = (ownerId: string) =>
        Effect.sync(() => (selectOwned.all(ownerId) as unknown as Array<FileRow>).map(toStoredFile))

      const upload = Effect.fn("Files.upload")(
        function* (ownerId: string, upload: Multipart.PersistedFile) {
          const size = yield* Effect.promise(() => stat(upload.path)).pipe(
            Effect.map((info) => info.size),
          )
          const file: StoredFile = {
            id: randomUUID(),
            name: fileName(upload.name),
            contentType: mediaType(upload.contentType),
            size,
            createdAt: new Date(yield* Clock.currentTimeMillis),
          }
          if (size > FILE_QUOTA_BYTES) return yield* new HttpApiError.Conflict()
          yield* storage.put(file.id, { path: upload.path, contentType: file.contentType })
          // Synchronous check-and-insert, so concurrent uploads cannot overrun the quota.
          const accepted = (() => {
            const { used } = usedBytes.get(ownerId) as { readonly used: number }
            if (used + size > FILE_QUOTA_BYTES) return false
            insert.run(
              file.id,
              ownerId,
              file.name,
              file.contentType,
              size,
              file.createdAt.getTime(),
            )
            return true
          })()
          if (!accepted) {
            yield* storage.remove(file.id).pipe(Effect.ignore)
            return yield* new HttpApiError.Conflict()
          }
          return file
        },
        Effect.catchTag("StorageError", Effect.die),
      )

      const open = (ownerId: string, id: string) =>
        Effect.gen(function* () {
          const row = selectOne.get(ownerId, id) as FileRow | undefined
          if (row === undefined) return Option.none()
          const body = yield* storage.get(row.id).pipe(Effect.orDie)
          return Option.map(body, (body) => ({ file: toStoredFile(row), body }))
        })

      const remove = Effect.fn("Files.remove")(function* (ownerId: string, id: string) {
        if (deleteOne.run(ownerId, id).changes === 0) return yield* new HttpApiError.NotFound()
        // The row is the source of truth; an orphaned object is only wasted space.
        yield* storage
          .remove(id)
          .pipe(
            Effect.catchCause(() =>
              Effect.logWarning("Deleted file metadata but could not remove its stored object"),
            ),
          )
      })

      return Files.of({ list, upload, open, remove })
    }),
  )
}

export const FilesHandlers = HttpApiBuilder.group(
  AppApi,
  "files",
  Effect.fn(function* (handlers) {
    const files = yield* Files
    return handlers.handleAll({
      list: () =>
        Effect.gen(function* () {
          return yield* files.list((yield* CurrentUser).id)
        }),
      upload: ({ payload }) =>
        Effect.gen(function* () {
          return yield* files.upload((yield* CurrentUser).id, payload.file)
        }),
      remove: ({ params }) =>
        Effect.gen(function* () {
          return yield* files.remove((yield* CurrentUser).id, params.id)
        }),
    })
  }),
)

const noStore = { "cache-control": "no-store" }

/** Owner-only downloads. User content never renders as a document on this origin. */
export const FileRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth
    const files = yield* Files
    yield* router.add("GET", `${FILES_PATH}/:id`, (request) =>
      Effect.gen(function* () {
        const user = yield* auth.session(webHeaders(request))
        if (Option.isNone(user)) {
          return HttpServerResponse.jsonUnsafe(
            { error: "Unauthorized" },
            { status: 401, headers: noStore },
          )
        }
        const { id } = yield* HttpRouter.params
        const found = id === undefined ? Option.none() : yield* files.open(user.value.id, id)
        if (Option.isNone(found)) {
          return HttpServerResponse.jsonUnsafe(
            { error: "Not found" },
            { status: 404, headers: noStore },
          )
        }
        const { file, body } = found.value
        const inline = inlineTypes.has(file.contentType)
        return HttpServerResponse.stream(
          Stream.fromReadableStream({ evaluate: () => body, onError: (cause) => cause }),
          {
            contentType: inline ? file.contentType : "application/octet-stream",
            contentLength: file.size,
            headers: {
              "cache-control": "private, no-cache",
              "content-disposition": contentDisposition(
                inline ? "inline" : "attachment",
                file.name,
              ),
              "content-security-policy": "default-src 'none'; sandbox",
              "x-content-type-options": "nosniff",
            },
          },
        )
      }),
    )
  }),
)
