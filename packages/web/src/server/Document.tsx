import type { ReactNode } from "react"
import { renderToString } from "react-dom/server"
import { ThemeToggle } from "../components/ThemeToggle.tsx"
import { AppTheme } from "../components/AppTheme.tsx"
import { ThemePreferenceContext, type ThemePreference } from "../components/themePreference.ts"
import { type Section, Shell, type Viewer } from "../components/Shell.tsx"

export function Document({
  title,
  theme,
  current,
  css,
  script,
  performance,
  preloads = [],
  viewer,
  children,
}: {
  title: string
  theme: ThemePreference
  current: Section
  css: string
  script?: string | undefined
  performance: string
  preloads?: string[]
  viewer?: Viewer | undefined
  children?: ReactNode
}) {
  // Render independently so React useId values match the toggle's hydration root.
  const themeToggle = renderToString(
    <ThemePreferenceContext value={theme}>
      <ThemeToggle />
    </ThemePreferenceContext>,
  )
  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      data-appearance={theme}
      data-astryx-theme="neutral"
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`${title} · Little world`}</title>
        {theme === "system" ? (
          <>
            <meta name="theme-color" content="#f7f5ee" media="(prefers-color-scheme: light)" />
            <meta name="theme-color" content="#20231e" media="(prefers-color-scheme: dark)" />
          </>
        ) : (
          <meta name="theme-color" content={theme === "dark" ? "#20231e" : "#f7f5ee"} />
        )}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/images/terrarium-whimsical.png" />
        <link rel="stylesheet" href={css} />
        {preloads.map((href) => (
          <link key={href} rel="modulepreload" href={href} />
        ))}
        <script type="module" src={performance} />
        <script type="speculationrules">
          {JSON.stringify({
            prefetch: [
              {
                source: "document",
                where: {
                  selector_matches:
                    "a:is([href='/'], [href='/journal'], [href='/about']):not([download]):not([target])",
                },
                eagerness: "moderate",
              },
            ],
          })}
        </script>
        {script && <script type="module" src={script} />}
      </head>
      <body>
        <ThemePreferenceContext value={theme}>
          <AppTheme>
            <Shell current={current} viewer={viewer} themeToggle={themeToggle}>
              {children}
            </Shell>
          </AppTheme>
        </ThemePreferenceContext>
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
    <>
      <div
        data-island={name}
        inert
        aria-busy="true"
        data-props={props === undefined ? undefined : JSON.stringify(props)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: html is our own server-rendered island markup, never user input
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p data-island-status={name} role="status">
        Loading interactive controls…
      </p>
      <noscript>
        Interactive controls require JavaScript. You can still browse the garden and journal.
      </noscript>
    </>
  )
}
