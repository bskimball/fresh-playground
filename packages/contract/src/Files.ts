import { Schema } from "effect"
import { Multipart } from "effect/http"
import { HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import { Authentication } from "./Auth.ts"

export const FILES_PATH = "/api/files"
export const FILE_MAX_BYTES = 10 * 1024 * 1024
export const FILE_QUOTA_BYTES = 100 * 1024 * 1024
export const FILE_NAME_MAX = 255

/** Downloads are served by a plain route so the response can stream with its own headers. */
export const fileHref = (id: string) => `${FILES_PATH}/${encodeURIComponent(id)}`

export const StoredFile = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  contentType: Schema.String,
  size: Schema.Int,
  createdAt: Schema.Date,
})
export type StoredFile = typeof StoredFile.Type

export const FileUpload = Schema.Struct({ file: Multipart.SingleFileSchema }).pipe(
  HttpApiSchema.asMultipart({ maxParts: 1, maxFileSize: FILE_MAX_BYTES }),
)

/** The signed-in user's own uploads. Every endpoint is scoped to `CurrentUser`. */
export class FilesApi extends HttpApiGroup.make("files")
  .add(
    HttpApiEndpoint.get("list", "/", { success: Schema.Array(StoredFile) }),
    HttpApiEndpoint.post("upload", "/", {
      payload: FileUpload,
      success: StoredFile,
      // Conflict: the upload would exceed the per-user quota.
      error: [HttpApiError.BadRequest, HttpApiError.Conflict],
    }),
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: Schema.String },
      error: HttpApiError.NotFound,
    }),
  )
  .middleware(Authentication)
  .prefix(FILES_PATH) {}
