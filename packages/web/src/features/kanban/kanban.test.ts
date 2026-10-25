import { RegistryProvider, useAtomInitialValues, useAtomValue } from "@effect/atom-react"
import type { KanbanCard } from "@playground/contract"
import { AsyncResult } from "effect/reactivity"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vite-plus/test"
import { createActor } from "xstate"
import { ApiClient, seedAtom } from "../../client/ApiClient.ts"
import { defineIsland } from "../../client/hydrateIsland.ts"
import { decodeRealtimeTopics, realtimeTopicForPath } from "../../client/Realtime.ts"
import { adminPanelHref, hrefFor, loginHref } from "../../components/sections.ts"
import {
  computeNavPillDelta,
  hasThemeCookie,
  nextTheme,
  parseTheme,
  themeFromCookie,
} from "../../components/themeDom.ts"
import { safeNext, transformShell } from "../../server/runtime.ts"
import {
  canAcceptNewCard,
  kanbanMachine,
  moveCardInList,
  reconcileKanbanSave,
  shiftCardInColumn,
} from "./kanban.machine.ts"

const sampleCards: ReadonlyArray<KanbanCard> = [
  { id: "c1", title: "One", note: "", status: "todo", tag: "care" },
  { id: "c2", title: "Two", note: "", status: "todo", tag: "craft" },
  { id: "c3", title: "Three", note: "", status: "doing", tag: "study" },
  { id: "c4", title: "Four", note: "", status: "done", tag: "harvest" },
]

describe("Kanban board ordering & validation", () => {
  it("moves cards between columns and inserts before a target card", () => {
    const movedToDoing = moveCardInList(sampleCards, "c1", "doing")
    expect(movedToDoing.find((c) => c.id === "c1")?.status).toBe("doing")
    expect(movedToDoing.map((c) => c.id)).toEqual(["c2", "c3", "c1", "c4"])

    const movedBefore = moveCardInList(sampleCards, "c4", "todo", "c2")
    expect(movedBefore.find((c) => c.id === "c4")?.status).toBe("todo")
    expect(movedBefore.map((c) => c.id)).toEqual(["c1", "c4", "c2", "c3"])
  })

  it("shifts cards up and down within their column without disturbing other columns", () => {
    const shiftedDown = shiftCardInColumn(sampleCards, "c1", 1)
    expect(shiftedDown.map((c) => c.id)).toEqual(["c2", "c1", "c3", "c4"])

    const shiftedUpAtTop = shiftCardInColumn(sampleCards, "c1", -1)
    expect(shiftedUpAtTop).toBe(sampleCards)
  })

  it("validates new card title and note limits", () => {
    expect(canAcceptNewCard(sampleCards, "   ", "note")).toBe(false)
    expect(canAcceptNewCard(sampleCards, "Water ferns", "Gentle mist")).toBe(true)
    expect(canAcceptNewCard(sampleCards, "x".repeat(161), "")).toBe(false)
  })

  it("skips a queued stale save when a newer snapshot was already saved and acknowledged", () => {
    const staleCards = sampleCards.slice(0, 1)
    const newerCards = sampleCards.slice(0, 3)

    // When T2 is still pending in storage while T1 acquires the lock, T1 upgrades to saving T2
    expect(
      reconcileKanbanSave(
        { cards: staleCards, token: "token-1" },
        { token: "token-2", cards: newerCards, updatedAt: new Date(), pendingSave: true },
      ),
    ).toEqual({
      action: "save",
      cards: newerCards,
      tokenToAck: "token-2",
    })

    // Once T2 has been saved and acknowledged (persisted === null), a waiting T1 skips overwriting
    expect(reconcileKanbanSave({ cards: staleCards, token: "token-1" }, null)).toEqual({
      action: "skip",
    })

    // When localStorage was unavailable or failed (token === ""), save still proceeds with in-memory cards
    // even if an older snapshot remains in localStorage, and acknowledges that older snapshot token.
    expect(reconcileKanbanSave({ cards: newerCards, token: "" }, null)).toEqual({
      action: "save",
      cards: newerCards,
      tokenToAck: "",
    })
    expect(
      reconcileKanbanSave(
        { cards: newerCards, token: "" },
        { token: "stale-token-1", cards: staleCards, updatedAt: new Date(), pendingSave: true },
      ),
    ).toEqual({
      action: "save",
      cards: newerCards,
      tokenToAck: "stale-token-1",
    })
  })
})

describe("realtime freshness boundary", () => {
  it("schema-decodes public topics and rejects malformed or unrelated messages", () => {
    expect(decodeRealtimeTopics("invalidate", '{"topic":"garden"}')).toEqual(["garden"])
    expect(decodeRealtimeTopics("invalidate", '{"topic":"kanban"}')).toEqual(["kanban"])
    expect(decodeRealtimeTopics("resync", '{"topics":["garden","kanban","garden"]}')).toEqual([
      "garden",
      "kanban",
    ])
    for (const data of ["not JSON", '{"topic":"theme"}', "{}", { topic: "garden" }]) {
      expect(decodeRealtimeTopics("invalidate", data)).toEqual([])
    }
    expect(decodeRealtimeTopics("resync", '{"topics":["garden","private"]}')).toEqual([])
    expect(decodeRealtimeTopics("heartbeat", "{}")).toEqual([])
    expect(decodeRealtimeTopics("message", '{"topic":"garden"}')).toEqual([])
  })

  it("maps only exact public snapshot endpoints to realtime network-read requirements", () => {
    expect(realtimeTopicForPath("/api/garden")).toBe("garden")
    expect(realtimeTopicForPath("/api/kanban")).toBe("kanban")
    for (const path of ["/api/events", "/api/auth/session", "/api/hello", "/api/garden/settings"]) {
      expect(realtimeTopicForPath(path)).toBeUndefined()
    }
  })

  it("keeps pending local board edits when freshness requests revalidation", () => {
    const actor = createActor(kanbanMachine, {
      input: { board: { cards: sampleCards, updatedAt: new Date(0) } },
    }).start()
    try {
      actor.send({ type: "MOVE_CARD", cardId: "c1", toStatus: "done" })
      const before = actor.getSnapshot()
      expect(before.matches({ board: "pending" })).toBe(true)
      actor.send({ type: "REVALIDATE" })
      const after = actor.getSnapshot()
      expect(after.matches({ board: "pending", freshness: "waiting" })).toBe(true)
      expect(after.context.cards).toEqual(before.context.cards)
      expect(after.context.revision).toBe(before.context.revision)
      expect(after.context.cards.find((card) => card.id === "c1")?.status).toBe("done")
    } finally {
      actor.stop()
    }
  })
})

describe("safeNext redirect sanitization & theme parsing", () => {
  it("allows only normalized same-origin paths", () => {
    expect(safeNext("/admin/users?tab=1#top")).toBe("/admin/users?tab=1#top")
    expect(safeNext("https://evil.example/phish")).toBe("/")
    expect(safeNext("//evil.example")).toBe("/")
    expect(safeNext("/\\evil.example")).toBe("/")
    expect(safeNext("/..//evil.example")).toBe("/")
    expect(safeNext(null)).toBe("/")
  })

  it("parses and cycles theme preferences", () => {
    expect(parseTheme("dark")).toBe("dark")
    expect(parseTheme("invalid")).toBe("system")
    expect(hasThemeCookie("foo=1; bar=2")).toBe(false)
    expect(hasThemeCookie("foo=1; theme=light; bar=2")).toBe(true)
    expect(themeFromCookie("foo=1; theme=light; bar=2")).toBe("light")
    expect(nextTheme("system")).toBe("light")
    expect(nextTheme("light")).toBe("dark")
    expect(nextTheme("dark")).toBe("system")
  })

  it("computes nav pill FLIP deltas only when not handled by a native view transition or reduced motion", () => {
    const prev = { left: 5, top: 4, width: 88, height: 36, path: "/" }
    const current = { left: 97, top: 4, width: 88, height: 36, path: "/kanban" }
    expect(computeNavPillDelta(prev, current, true, false)).toBeNull()
    expect(computeNavPillDelta(prev, current, false, true)).toBeNull()
    expect(computeNavPillDelta(prev, { ...current, path: "/" }, false, false)).toBeNull()
    expect(computeNavPillDelta(prev, current, false, false)).toEqual({
      dx: -92,
      dy: 0,
      sx: 1,
      sy: 1,
    })
  })

  it("builds typed section, admin panel, and login hrefs", () => {
    expect(hrefFor("garden")).toBe("/")
    expect(hrefFor("kanban")).toBe("/kanban")
    expect(adminPanelHref("users")).toBe("/admin/users")
    expect(loginHref()).toBe("/login")
    expect(loginHref("/")).toBe("/login")
    expect(loginHref("/admin/users")).toBe("/login?next=%2Fadmin%2Fusers")
  })

  it("seeds AtomHttpApi SSR islands inside isolated RegistryProviders, supports deferred hydration triggers, and preserves body markup in transformShell", async () => {
    const helloAtom = ApiClient.query("system", "hello", {})
    const utcTime = new Intl.DateTimeFormat("en", { timeStyle: "medium", timeZone: "UTC" })
    const SeededHello = ({ message }: { readonly message: string }) => {
      useAtomInitialValues([
        seedAtom(helloAtom, { message, time: new Date("2026-01-01T13:45:30Z") }),
      ])
      const result = useAtomValue(helloAtom)
      return createElement(
        "span",
        null,
        AsyncResult.match(result, {
          onInitial: () => "Loading…",
          onFailure: () => "Error",
          onSuccess: ({ value }) => `${value.message} (${utcTime.format(value.time)} UTC)`,
        }),
      )
    }

    const firstRender = renderToString(
      createElement(
        RegistryProvider,
        null,
        createElement(SeededHello, { message: "First SSR request" }),
      ),
    )
    const secondRender = renderToString(
      createElement(
        RegistryProvider,
        null,
        createElement(SeededHello, { message: "Second SSR request" }),
      ),
    )
    expect(firstRender).toContain("First SSR request (1:45:30 PM UTC)")
    expect(secondRender).toContain("Second SSR request (1:45:30 PM UTC)")

    const idleIsland = defineIsland("idle-demo", () => createElement("span", null, "Idle"), {
      hydrate: "idle",
    })
    expect(idleIsland.hydrate).toBe("idle")

    const sampleHtml =
      '<!DOCTYPE html><html><head><script>const s="<body>";</script></head><body><div data-props="{&quot;raw&quot;:&quot;%ENV% and </body>&quot;}">Hello</div></body></html>'
    const transformed = await transformShell(
      {
        transformIndexHtml: async (_url, shell) =>
          shell.replace("</head>", '<script type="module" src="/@vite/client"></script></head>'),
      },
      "/about",
      sampleHtml,
    )
    expect(transformed).toContain('<script type="module" src="/@vite/client"></script></head>')
    expect(transformed).toContain(
      '<div data-props="{&quot;raw&quot;:&quot;%ENV% and </body>&quot;}">Hello</div>',
    )
  })
})
