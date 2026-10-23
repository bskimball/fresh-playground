import type { ReactNode } from "react"
import type { IslandCodec } from "../client/hydrateIsland.ts"
import { AppTheme } from "../components/AppTheme.tsx"
import { type Section, Shell, type Viewer } from "../components/Shell.tsx"
import { ThemePreferenceContext, type ThemePreference } from "../components/themePreference.ts"

export function Document({
  title,
  theme,
  current,
  css,
  fonts = [],
  script,
  performance,
  preloads = [],
  devReload = false,
  viewer,
  children,
}: {
  title: string
  theme: ThemePreference
  current: Section
  css: string
  fonts?: ReadonlyArray<string> | undefined
  script?: string | undefined
  performance: string
  preloads?: ReadonlyArray<string> | undefined
  devReload?: boolean | undefined
  viewer?: Viewer | undefined
  children?: ReactNode
}) {
  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      data-appearance={theme}
      data-astryx-theme="neutral"
      data-dev-reload={devReload ? "" : undefined}
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
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: static inline theme-cookie sync script prevents stale prefetch/SW theme flash
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{window.addEventListener('pagereveal',e=>{window.__vt=e.viewTransition?1:0});const m=document.cookie.match(/(?:^|;\\s*)theme=(light|dark|system)(?:;|$)/);if(!m)return;const t=m[1];document.documentElement.dataset.appearance=t;if(t==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.dataset.theme=t;})()",
          }}
        />
        {fonts.map((href) => (
          <link key={href} rel="preload" as="font" type="font/woff2" crossOrigin="" href={href} />
        ))}
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
                    "a:is([href='/'], [href='/kanban'], [href='/journal'], [href='/about']):not([download]):not([target])",
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
            <Shell current={current} viewer={viewer}>
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
export function Island<P>(
  options:
    | { island: IslandCodec<P>; name?: undefined; html: string; props: P }
    | { island?: undefined; name: string; html: string; props?: unknown },
) {
  const islandName = options.island ? options.island.name : options.name
  const encodedProps = options.island ? options.island.encode(options.props) : options.props
  return (
    <>
      <div
        data-island={islandName}
        inert
        aria-busy="true"
        data-props={encodedProps === undefined ? undefined : JSON.stringify(encodedProps)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: html is our own server-rendered island markup, never user input
        dangerouslySetInnerHTML={{ __html: options.html }}
      />
      <p data-island-status={islandName} role="status">
        Loading interactive controls…
      </p>
      <noscript>
        Interactive controls require JavaScript. You can still browse the garden and journal.
      </noscript>
    </>
  )
}
