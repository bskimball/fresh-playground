import type { ReactNode } from "react"
import { AppTheme } from "../components/AppTheme.tsx"
import { type Section, Shell } from "../components/Shell.tsx"

export function Document({
  title,
  current,
  css,
  script,
  children,
}: {
  title: string
  current: Section
  css: string
  script?: string | undefined
  children?: ReactNode
}) {
  return (
    <html lang="en" data-theme="light" data-astryx-theme="neutral">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`${title} · Little world`}</title>
        <meta name="theme-color" content="#f7f5ee" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Fraunces:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap"
        />
        <link rel="stylesheet" href={css} />
        {script && <script type="module" src={script} />}
      </head>
      <body>
        <AppTheme>
          <Shell current={current}>{children}</Shell>
        </AppTheme>
      </body>
    </html>
  )
}

/**
 * Hydration root for an island. The island is rendered on its own, so its
 * markup matches what `hydrateRoot` renders in the browser.
 */
export function Island({ name, html, props }: { name: string; html: string; props?: unknown }) {
  return (
    <div
      data-island={name}
      data-props={props === undefined ? undefined : JSON.stringify(props)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: html is our own server-rendered island markup, never user input
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
