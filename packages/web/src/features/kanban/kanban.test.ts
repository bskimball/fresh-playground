import type { KanbanCard } from "@playground/contract"
import { describe, expect, it } from "vite-plus/test"
import {
  computeNavPillDelta,
  hasThemeCookie,
  nextTheme,
  parseTheme,
  themeFromCookie,
} from "../../components/themeDom.ts"
import { safeNext } from "../../server/runtime.ts"
import {
  canAcceptNewCard,
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
})
