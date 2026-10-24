import { createContext, type ReactNode, useContext } from "react"
import { renderToString } from "react-dom/server"
import type { HydrationTrigger, IslandDefinition } from "../client/hydrateIsland.ts"
import type { IslandName } from "../client/islandRegistry.ts"
import { AppTheme } from "../components/AppTheme.tsx"
import { publicLinks, type Section } from "../components/sections.ts"
import { Shell, type Viewer } from "../components/Shell.tsx"
import { ThemePreferenceContext, type ThemePreference } from "../components/themePreference.ts"

interface IslandSlot {
  readonly name: IslandName
  readonly hydrate: HydrationTrigger
  readonly marker: string
  readonly render: () => ReactNode
}

type RegisterIslandSlot = (slot: Omit<IslandSlot, "marker">) => string

const IslandSlotContext = createContext<RegisterIslandSlot | null>(null)

const prefetchSelector = `a:is(${publicLinks
  .map((link) => `[href='${link.href}']`)
  .join(", ")}):not([download]):not([target])`

export function Document({
  title,
  theme,
  css,
  fonts = [],
  performance,
  preloads = [],
  bodyHtml,
}: {
  title: string
  theme: ThemePreference
  css: string
  fonts?: ReadonlyArray<string> | undefined
  performance: string
  preloads?: ReadonlyArray<string> | undefined
  bodyHtml: string
}) {
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
                where: { selector_matches: prefetchSelector },
                eagerness: "moderate",
              },
            ],
          })}
        </script>
      </head>
      <body
        // biome-ignore lint/security/noDangerouslySetInnerHtml: bodyHtml is our own server-rendered Shell and Island markup
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </html>
  )
}

export function renderDocument({
  title,
  theme,
  current,
  css,
  fonts = [],
  performance,
  preloadsFor,
  viewer,
  children,
}: {
  title: string
  theme: ThemePreference
  current: Section
  css: string
  fonts?: ReadonlyArray<string> | undefined
  performance: string
  preloadsFor?: ((islands: Iterable<IslandName>) => ReadonlyArray<string>) | undefined
  viewer?: Viewer | undefined
  children?: ReactNode
}): string {
  const slots: Array<IslandSlot> = []
  const registerSlot: RegisterIslandSlot = (slot) => {
    const marker = `<!--__ISLAND_SLOT_${slots.length}__-->`
    slots.push({ ...slot, marker })
    return marker
  }

  let bodyHtml = renderToString(
    <IslandSlotContext value={registerSlot}>
      <ThemePreferenceContext value={theme}>
        <AppTheme>
          <Shell current={current} viewer={viewer}>
            {children}
          </Shell>
        </AppTheme>
      </ThemePreferenceContext>
    </IslandSlotContext>,
  )

  const eagerIslands = new Set<IslandName>()
  for (const slot of slots) {
    if (slot.hydrate === "load") eagerIslands.add(slot.name)
    const islandHtml = renderToString(
      <ThemePreferenceContext value={theme}>
        <AppTheme>{slot.render()}</AppTheme>
      </ThemePreferenceContext>,
    )
    bodyHtml = bodyHtml.replace(slot.marker, () => islandHtml)
  }

  const preloads = preloadsFor ? preloadsFor(eagerIslands) : []

  return `<!DOCTYPE html>${renderToString(
    <Document
      title={title}
      theme={theme}
      css={css}
      fonts={fonts}
      performance={performance}
      preloads={preloads}
      bodyHtml={bodyHtml}
    />,
  )}`
}

/**
 * Hydration root for an island. The island is rendered in its own isolated
 * React root so its markup and `useId` sequence match `hydrateRoot`.
 */
export function Island<P, Name extends IslandName = IslandName>(
  options: [P] extends [void]
    ? { readonly island: IslandDefinition<P, Name>; readonly props?: undefined }
    : { readonly island: IslandDefinition<P, Name>; readonly props: P },
) {
  const { island } = options
  const props = options.props as P
  const encodedProps = props === undefined ? undefined : island.encode(props)
  const registerSlot = useContext(IslandSlotContext)
  const theme = useContext(ThemePreferenceContext) ?? "system"
  const innerHtml = registerSlot
    ? registerSlot({
        name: island.name,
        hydrate: island.hydrate,
        render: () => island.render(props),
      })
    : renderToString(
        <ThemePreferenceContext value={theme}>
          <AppTheme>{island.render(props)}</AppTheme>
        </ThemePreferenceContext>,
      )

  return (
    <>
      <div
        data-island={island.name}
        data-hydrate={island.hydrate === "visible" ? "visible" : undefined}
        inert
        aria-busy="true"
        data-props={encodedProps === undefined ? undefined : JSON.stringify(encodedProps)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: innerHtml is our own server-rendered island markup, never user input
        dangerouslySetInnerHTML={{ __html: innerHtml }}
      />
      <p data-island-status={island.name} role="status">
        Loading interactive controls…
      </p>
      <noscript>
        Interactive controls require JavaScript. You can still browse the garden and journal.
      </noscript>
    </>
  )
}
