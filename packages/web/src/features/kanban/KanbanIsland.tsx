import { Badge } from "@astryxdesign/core/Badge"
import { Button } from "@astryxdesign/core/Button"
import { Card } from "@astryxdesign/core/Card"
import { TextInput } from "@astryxdesign/core/TextInput"
import {
  KANBAN_BOARD_MAX,
  KANBAN_NOTE_MAX,
  KANBAN_TITLE_MAX,
  KanbanBoard,
  type KanbanCard,
  type KanbanStatus,
  type KanbanTag,
  kanbanStatuses,
  kanbanTags,
} from "@playground/contract"
import * as stylex from "@stylexjs/stylex"
import { useActorRef, useSelector } from "@xstate/react"
import { type DragEvent, type FormEvent, useEffect, useState } from "react"
import { defineIsland } from "../../client/hydrateIsland.ts"
import { Icon } from "../../components/Icon.tsx"
import { schemaJsonCodec } from "../../machines/offlineSync.ts"
import { text } from "../../styles/text.ts"
import { colors, fonts, media } from "../../styles/tokens.stylex.ts"
import { canAcceptNewCard, kanbanMachine } from "./kanban.machine.ts"
import {
  loadKanbanOfflineSnapshot,
  watchKanbanFreshness,
  watchKanbanOfflineSnapshots,
} from "./offline.ts"

const columnMeta: Record<
  KanbanStatus,
  {
    readonly title: string
    readonly subtitle: string
    readonly empty: string
  }
> = {
  todo: {
    title: "Planting",
    subtitle: "Seeds & upcoming work",
    empty: "Drop a task here or plant a new one above.",
  },
  doing: {
    title: "Sprouting",
    subtitle: "Active focus in the grove",
    empty: "Drag a task here when you’re ready to begin.",
  },
  done: {
    title: "Bloomed",
    subtitle: "Completed & gathered",
    empty: "Finished tasks rest here once complete.",
  },
}

const tagMeta: Record<
  KanbanTag,
  {
    readonly label: string
    readonly badgeVariant: "neutral" | "success" | "warning" | "info"
  }
> = {
  care: { label: "Care", badgeVariant: "success" },
  craft: { label: "Craft", badgeVariant: "neutral" },
  study: { label: "Study", badgeVariant: "info" },
  harvest: { label: "Harvest", badgeVariant: "warning" },
}

const formatBoardStatus = (boardState: "saved" | "pending" | "saving" | "unsaved") => {
  if (boardState === "pending" || boardState === "saving") return "Saving…"
  if (boardState === "unsaved") return "Saved offline · syncs when online"
  return "All changes saved"
}

interface DropTarget {
  readonly status: KanbanStatus
  readonly beforeCardId: string | null
}

export const kanbanIsland = defineIsland("kanban", KanbanIsland, {
  codec: schemaJsonCodec(KanbanBoard),
})

/** Hydrated Kanban productivity island with drag-and-drop and offline sync. */
export default function KanbanIsland(initial: KanbanBoard) {
  const actor = useActorRef(kanbanMachine, { input: { board: initial } })

  useEffect(() => {
    const offline = loadKanbanOfflineSnapshot()
    if (offline) actor.send({ type: "RESTORE_OFFLINE", snapshot: offline })
    const stopOffline = watchKanbanOfflineSnapshots((next) => {
      if (next) {
        actor.send({ type: "RESTORE_OFFLINE", snapshot: next })
      } else {
        actor.send({ type: "CLEAR_OFFLINE" })
        actor.send({ type: "REVALIDATE" })
      }
    })
    const stopFreshness = watchKanbanFreshness(() => actor.send({ type: "REVALIDATE" }))
    return () => {
      stopOffline()
      stopFreshness()
    }
  }, [actor])

  const cards = useSelector(actor, (s) => s.context.cards)
  const filterTag = useSelector(actor, (s) => s.context.filterTag)
  const search = useSelector(actor, (s) => s.context.search)
  const boardState = useSelector(actor, (s) => s.value.board)

  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [newTag, setNewTag] = useState<KanbanTag>("care")
  const [newStatus, setNewStatus] = useState<KanbanStatus>("todo")
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

  const normalizedQuery = search.trim().toLowerCase()
  const visibleCards = cards.filter((card) => {
    if (filterTag !== "all" && card.tag !== filterTag) return false
    if (!normalizedQuery) return true
    return (
      card.title.toLowerCase().includes(normalizedQuery) ||
      card.note.toLowerCase().includes(normalizedQuery)
    )
  })

  const totalCount = cards.length
  const doneCount = cards.filter((card) => card.status === "done").length
  const bloomPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const titleTooLong = title.trim().length > KANBAN_TITLE_MAX
  const noteTooLong = note.trim().length > KANBAN_NOTE_MAX
  const boardFull = cards.length >= KANBAN_BOARD_MAX
  const canSubmit = canAcceptNewCard(cards, title, note)

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return
    actor.send({
      type: "ADD_CARD",
      title,
      note,
      status: newStatus,
      tag: newTag,
    })
    setTitle("")
    setNote("")
  }

  const handleDragStart = (event: DragEvent<HTMLElement>, cardId: string) => {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", cardId)
    setDraggingId(cardId)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropTarget(null)
  }

  const handleCardDragOver = (
    event: DragEvent<HTMLElement>,
    status: KanbanStatus,
    cardId: string,
    nextCardId: string | null,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "move"
    const rect = event.currentTarget.getBoundingClientRect()
    const isTopHalf = event.clientY < rect.top + rect.height / 2
    const beforeCardId = cardId === draggingId || isTopHalf ? cardId : nextCardId
    if (dropTarget?.status !== status || dropTarget.beforeCardId !== beforeCardId) {
      setDropTarget({ status, beforeCardId })
    }
  }

  const handleColumnDragOver = (event: DragEvent<HTMLElement>, status: KanbanStatus) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    if (dropTarget?.status !== status || dropTarget.beforeCardId !== null) {
      setDropTarget({ status, beforeCardId: null })
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>, fallbackStatus: KanbanStatus) => {
    event.preventDefault()
    const cardId = draggingId ?? event.dataTransfer.getData("text/plain")
    const targetStatus = dropTarget?.status ?? fallbackStatus
    const beforeCardId = dropTarget?.status === targetStatus ? dropTarget.beforeCardId : null
    setDraggingId(null)
    setDropTarget(null)
    if (!cardId) return
    actor.send({
      type: "MOVE_CARD",
      cardId,
      toStatus: targetStatus,
      beforeCardId,
    })
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headerCopy)}>
          <span {...stylex.props(styles.eyebrowPill)}>
            <Icon name="board" size={12} />
            <span>CULTIVATING MOMENTUM</span>
          </span>
          <h1 {...stylex.props(text.serif, styles.title)}>
            Field notes &amp; <em {...stylex.props(styles.emphasis)}>tasks.</em>
          </h1>
          <p {...stylex.props(styles.intro, text.pretty)}>
            Tend your work at an unhurried pace. Drag cards between stages, reorder priorities, or
            plant a new task below.
          </p>
        </div>
        <div {...stylex.props(styles.telemetryCard)}>
          <div {...stylex.props(styles.metricRow)}>
            <span {...stylex.props(styles.metricPill)}>
              <Icon name="spark" size={15} />
              <strong {...stylex.props(text.tabular)}>
                {doneCount}/{totalCount}
              </strong>{" "}
              bloomed
            </span>
            <span
              role="status"
              aria-live="polite"
              {...stylex.props(styles.syncPill, boardState === "unsaved" && styles.syncPillOffline)}
            >
              <span
                {...stylex.props(styles.syncDot, boardState === "unsaved" && styles.syncDotOffline)}
              />
              {formatBoardStatus(boardState)}
            </span>
          </div>
          <div {...stylex.props(styles.progressMeta)}>
            <span {...stylex.props(styles.progressLabel)}>Season progress</span>
            <span {...stylex.props(styles.progressValue, text.tabular)}>{bloomPercent}%</span>
          </div>
          <div {...stylex.props(styles.progressTrack)} aria-hidden="true">
            <div {...stylex.props(styles.progressFill)} style={{ width: `${bloomPercent}%` }} />
          </div>
        </div>
      </div>

      <Card xstyle={styles.composerCard}>
        <form {...stylex.props(styles.composerForm)} onSubmit={handleCreate}>
          <div {...stylex.props(styles.composerHeader)}>
            <span {...stylex.props(styles.composerHeading)}>
              <Icon name="plus" size={14} />
              <span>PLANT A NEW TASK</span>
            </span>
            <span {...stylex.props(styles.capacityBadge, text.tabular)}>
              {cards.length}/{KANBAN_BOARD_MAX}
            </span>
          </div>
          <div {...stylex.props(styles.composerInputs)}>
            <TextInput
              label="New task"
              placeholder="What needs tending?"
              value={title}
              onChange={setTitle}
              {...(titleTooLong
                ? { errorMessage: `Keep titles within ${KANBAN_TITLE_MAX} characters.` }
                : boardFull
                  ? { errorMessage: `Board limit of ${KANBAN_BOARD_MAX} tasks reached.` }
                  : {})}
              isRequired
            />
            <TextInput
              label="Notes"
              placeholder="Optional context or next step…"
              value={note}
              onChange={setNote}
              {...(noteTooLong
                ? { errorMessage: `Keep notes within ${KANBAN_NOTE_MAX} characters.` }
                : {})}
            />
          </div>
          <div {...stylex.props(styles.composerControls)}>
            <div {...stylex.props(styles.optionGroup)} role="group" aria-label="Task category">
              <span {...stylex.props(styles.groupLabel)}>TAG</span>
              <div {...stylex.props(styles.segmentTrack)}>
                {kanbanTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-pressed={newTag === tag}
                    onClick={() => setNewTag(tag)}
                    {...stylex.props(styles.chip, newTag === tag && styles.chipActive)}
                  >
                    {tagMeta[tag].label}
                  </button>
                ))}
              </div>
            </div>
            <div {...stylex.props(styles.optionGroup)} role="group" aria-label="Initial stage">
              <span {...stylex.props(styles.groupLabel)}>STAGE</span>
              <div {...stylex.props(styles.segmentTrack)}>
                {kanbanStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={newStatus === status}
                    onClick={() => setNewStatus(status)}
                    {...stylex.props(styles.chip, newStatus === status && styles.chipActive)}
                  >
                    {columnMeta[status].title}
                  </button>
                ))}
              </div>
            </div>
            <div {...stylex.props(styles.submitWrap)}>
              <Button type="submit" variant="primary" label="Add task" isDisabled={!canSubmit} />
            </div>
          </div>
        </form>
      </Card>

      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.filterBar)} role="group" aria-label="Filter by tag">
          <button
            type="button"
            aria-pressed={filterTag === "all"}
            onClick={() => actor.send({ type: "SET_FILTER", tag: "all" })}
            {...stylex.props(styles.filterChip, filterTag === "all" && styles.filterChipActive)}
          >
            <span>All</span>
            <span
              {...stylex.props(
                styles.filterCount,
                filterTag === "all" && styles.filterCountActive,
                text.tabular,
              )}
            >
              {cards.length}
            </span>
          </button>
          {kanbanTags.map((tag) => {
            const count = cards.filter((card) => card.tag === tag).length
            const active = filterTag === tag
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={active}
                onClick={() => actor.send({ type: "SET_FILTER", tag })}
                {...stylex.props(styles.filterChip, active && styles.filterChipActive)}
              >
                <span>{tagMeta[tag].label}</span>
                <span
                  {...stylex.props(
                    styles.filterCount,
                    active && styles.filterCountActive,
                    text.tabular,
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <div {...stylex.props(styles.searchBox)}>
          <TextInput
            label="Filter tasks"
            isLabelHidden
            placeholder="Search tasks…"
            value={search}
            onChange={(value) => actor.send({ type: "SET_SEARCH", search: value })}
            hasClear
          />
        </div>
      </div>

      <div {...stylex.props(styles.board)}>
        {kanbanStatuses.map((status, statusIndex) => {
          const columnCards = visibleCards.filter((card) => card.status === status)
          const prevStatus = kanbanStatuses[statusIndex - 1]
          const nextStatus = kanbanStatuses[statusIndex + 1]
          const isColumnDropActive = dropTarget?.status === status

          return (
            <section
              key={status}
              aria-label={columnMeta[status].title}
              data-column={status}
              onDragOver={(event) => handleColumnDragOver(event, status)}
              onDrop={(event) => handleDrop(event, status)}
              {...stylex.props(styles.column, isColumnDropActive && styles.columnDropActive)}
            >
              <header {...stylex.props(styles.columnHeader)}>
                <div>
                  <div {...stylex.props(styles.columnTitleRow)}>
                    <span
                      {...stylex.props(
                        styles.columnDot,
                        status === "doing" && styles.columnDotDoing,
                        status === "done" && styles.columnDotDone,
                      )}
                    />
                    <h2 {...stylex.props(text.serif, styles.columnTitle)}>
                      {columnMeta[status].title}
                    </h2>
                  </div>
                  <p {...stylex.props(styles.columnSubtitle)}>{columnMeta[status].subtitle}</p>
                </div>
                <span {...stylex.props(styles.columnCount, text.tabular)}>
                  {columnCards.length}
                </span>
              </header>

              <div {...stylex.props(styles.cardList)}>
                {columnCards.map((card: KanbanCard, index: number) => {
                  const nextCard = columnCards[index + 1]
                  const showDropBefore = isColumnDropActive && dropTarget.beforeCardId === card.id
                  const isDragging = draggingId === card.id

                  return (
                    <div key={card.id} {...stylex.props(styles.cardSlot)}>
                      {showDropBefore && <div {...stylex.props(styles.dropIndicator)} />}
                      <article
                        draggable
                        data-card-id={card.id}
                        onDragStart={(event) => handleDragStart(event, card.id)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(event) =>
                          handleCardDragOver(event, status, card.id, nextCard?.id ?? null)
                        }
                        {...stylex.props(styles.taskCard, isDragging && styles.taskCardDragging)}
                      >
                        <div {...stylex.props(styles.cardTop)}>
                          <Badge
                            variant={tagMeta[card.tag].badgeVariant}
                            label={tagMeta[card.tag].label}
                          />
                          <div {...stylex.props(styles.orderControls)}>
                            <button
                              type="button"
                              aria-label={`Move "${card.title}" up`}
                              disabled={index === 0}
                              onClick={() =>
                                actor.send({
                                  type: "SHIFT_CARD",
                                  cardId: card.id,
                                  direction: -1,
                                })
                              }
                              {...stylex.props(styles.iconAction)}
                            >
                              <Icon name="arrowUp" size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Move "${card.title}" down`}
                              disabled={index === columnCards.length - 1}
                              onClick={() =>
                                actor.send({
                                  type: "SHIFT_CARD",
                                  cardId: card.id,
                                  direction: 1,
                                })
                              }
                              {...stylex.props(styles.iconAction)}
                            >
                              <Icon name="arrowDown" size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete "${card.title}"`}
                              onClick={() => actor.send({ type: "DELETE_CARD", cardId: card.id })}
                              {...stylex.props(styles.iconAction, styles.deleteAction)}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </div>

                        <h3
                          {...stylex.props(
                            styles.cardTitle,
                            status === "done" && styles.cardTitleDone,
                          )}
                        >
                          {card.title}
                        </h3>
                        {card.note && (
                          <p {...stylex.props(styles.cardNote, text.pretty)}>{card.note}</p>
                        )}

                        <div {...stylex.props(styles.cardFooter)}>
                          <span {...stylex.props(styles.dragHint)} aria-hidden="true">
                            <span {...stylex.props(styles.dragGrip)}>⋮⋮</span> Drag
                          </span>
                          <div {...stylex.props(styles.moveActions)}>
                            {prevStatus && (
                              <button
                                type="button"
                                aria-label={`Move "${card.title}" to ${columnMeta[prevStatus].title}`}
                                onClick={() =>
                                  actor.send({
                                    type: "MOVE_CARD",
                                    cardId: card.id,
                                    toStatus: prevStatus,
                                  })
                                }
                                {...stylex.props(styles.moveButton)}
                              >
                                ← {columnMeta[prevStatus].title}
                              </button>
                            )}
                            {nextStatus && (
                              <button
                                type="button"
                                aria-label={`Move "${card.title}" to ${columnMeta[nextStatus].title}`}
                                onClick={() =>
                                  actor.send({
                                    type: "MOVE_CARD",
                                    cardId: card.id,
                                    toStatus: nextStatus,
                                  })
                                }
                                {...stylex.props(styles.moveButton, styles.moveButtonForward)}
                              >
                                {columnMeta[nextStatus].title} →
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  )
                })}

                {isColumnDropActive && dropTarget.beforeCardId === null && (
                  <div {...stylex.props(styles.dropIndicator)} />
                )}

                {columnCards.length === 0 && (
                  <div {...stylex.props(styles.emptyColumn)}>
                    <p {...stylex.props(styles.emptyText, text.pretty)}>
                      {columnMeta[status].empty}
                    </p>
                  </div>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

const styles = stylex.create({
  page: {
    display: "grid",
    gap: 24,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: 20,
  },
  headerCopy: {
    display: "grid",
    gap: 10,
    justifyItems: "start",
  },
  eyebrowPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 5,
    paddingInline: 11,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.8,
    color: colors.mossDark,
  },
  title: {
    fontSize: { default: "clamp(38px, 4.4vw, 56px)", [media.mobile]: 40 },
    lineHeight: 1.06,
    letterSpacing: -1.8,
    margin: 0,
  },
  emphasis: {
    fontWeight: 400,
    color: colors.olive,
  },
  intro: {
    fontSize: { default: 14, [media.mobile]: 13 },
    lineHeight: 1.7,
    color: colors.muted,
    maxWidth: 560,
    margin: 0,
  },
  telemetryCard: {
    display: "grid",
    gap: 10,
    minWidth: { default: 280, [media.mobile]: "100%" },
    paddingBlock: 14,
    paddingInline: 16,
    borderRadius: 16,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  metricRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  metricPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: colors.ink,
  },
  syncPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 4,
    paddingInline: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    fontSize: 11,
    color: colors.muted,
  },
  syncPillOffline: {
    borderColor: colors.sun,
    backgroundColor: colors.sunBg,
    color: colors.sun,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: colors.moss,
  },
  syncDotOffline: {
    backgroundColor: colors.sun,
  },
  progressMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: 11,
    color: colors.muted,
  },
  progressLabel: {
    letterSpacing: 0.3,
  },
  progressValue: {
    fontWeight: 600,
    color: colors.ink,
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.borderSubtle,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: colors.moss,
    transition: "width 0.25s ease-out",
  },
  composerCard: {
    paddingBlock: { default: 22, [media.mobile]: 18 },
    paddingInline: { default: 24, [media.mobile]: 18 },
    borderRadius: 22,
  },
  composerForm: {
    display: "grid",
    gap: 16,
  },
  composerHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  composerHeading: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.6,
    color: colors.mossDark,
  },
  capacityBadge: {
    fontSize: 11,
    fontWeight: 600,
    paddingBlock: 3,
    paddingInline: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.muted,
  },
  composerInputs: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1.1fr) minmax(0, 1.4fr)",
      [media.mobile]: "1fr",
    },
    gap: 14,
  },
  composerControls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    paddingBlock: 10,
    paddingInline: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  optionGroup: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  groupLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: colors.sage,
  },
  segmentTrack: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
  },
  submitWrap: {
    marginLeft: { default: "auto", [media.mobile]: 0 },
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  filterBar: {
    display: "inline-flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  filterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceTint,
    },
    color: colors.muted,
    font: "inherit",
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 6,
    paddingInline: 12,
    borderRadius: 999,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, box-shadow 0.15s ease-out, transform 0.1s ease-out",
  },
  filterChipActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderSubtle,
    boxShadow: colors.shadowSm,
    color: colors.ink,
    fontWeight: 600,
  },
  filterCount: {
    fontSize: 11,
    paddingBlock: 1,
    paddingInline: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceTint,
    color: colors.muted,
  },
  filterCountActive: {
    backgroundColor: colors.mist,
    color: colors.ink,
  },
  searchBox: {
    width: { default: 260, [media.mobile]: "100%" },
  },
  chip: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceTint,
    },
    color: colors.muted,
    font: "inherit",
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 5,
    paddingInline: 11,
    borderRadius: 999,
    cursor: "pointer",
    transform: { default: "none", ":active": "scale(0.96)" },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, box-shadow 0.15s ease-out, transform 0.1s ease-out",
  },
  chipActive: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.borderStrong,
    boxShadow: colors.shadowSm,
    color: colors.ink,
    fontWeight: 600,
  },
  board: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      [media.tablet]: "1fr",
    },
    gap: 20,
    alignItems: "start",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    paddingBlock: 18,
    paddingInline: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceSubtle,
    minHeight: 420,
    transition: "border-color 0.15s ease-out, background-color 0.15s ease-out",
  },
  columnDropActive: {
    borderColor: colors.moss,
    backgroundColor: colors.surfaceTint,
  },
  columnHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  columnTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  columnDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor: colors.sage,
  },
  columnDotDoing: {
    backgroundColor: colors.sun,
  },
  columnDotDone: {
    backgroundColor: colors.moss,
  },
  columnTitle: {
    fontSize: 22,
    letterSpacing: -0.5,
    margin: 0,
  },
  columnSubtitle: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
    marginBottom: 0,
  },
  columnCount: {
    fontSize: 12,
    fontWeight: 600,
    paddingBlock: 3,
    paddingInline: 9,
    borderRadius: 999,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.ink,
  },
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    flexGrow: 1,
  },
  cardSlot: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  dropIndicator: {
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.moss,
  },
  taskCard: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBlock: 15,
    paddingInline: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.borderSubtle,
      ":hover": colors.borderStrong,
    },
    backgroundColor: colors.surfaceElevated,
    cursor: "grab",
    boxShadow: colors.shadowSm,
    transition: "transform 0.15s ease-out, opacity 0.15s ease-out, border-color 0.15s ease-out",
  },
  taskCardDragging: {
    opacity: 0.45,
    transform: "scale(0.98)",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderControls: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  iconAction: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: "transparent",
      ":hover": colors.borderSubtle,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surfaceSubtle,
    },
    color: colors.muted,
    borderRadius: 8,
    width: 28,
    height: 28,
    display: "grid",
    placeItems: "center",
    font: "inherit",
    cursor: "pointer",
    padding: 0,
    opacity: {
      default: 1,
      ":disabled": 0.35,
    },
    transform: {
      default: "none",
      ":active": "scale(0.96)",
    },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, transform 0.1s ease-out",
  },
  deleteAction: {
    color: {
      default: colors.muted,
      ":hover": colors.danger,
    },
  },
  cardTitle: {
    fontFamily: fonts.serif,
    fontSize: 17,
    fontWeight: 500,
    lineHeight: 1.3,
    letterSpacing: -0.3,
    margin: 0,
    color: colors.ink,
  },
  cardTitleDone: {
    textDecoration: "line-through",
    color: colors.muted,
  },
  cardNote: {
    fontSize: 12,
    lineHeight: 1.6,
    color: colors.muted,
    margin: 0,
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
  dragHint: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 10,
    letterSpacing: 0.4,
    color: colors.faint,
    userSelect: "none",
  },
  dragGrip: {
    fontSize: 11,
    color: colors.sage,
  },
  moveActions: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  moveButton: {
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    backgroundColor: {
      default: colors.surfaceSubtle,
      ":hover": colors.surfaceTint,
    },
    color: colors.muted,
    borderRadius: 999,
    paddingBlock: 4,
    paddingInline: 10,
    font: "inherit",
    fontSize: 11,
    fontWeight: 500,
    cursor: "pointer",
    transform: {
      default: "none",
      ":active": "scale(0.96)",
    },
    transition:
      "background-color 0.15s ease-out, border-color 0.15s ease-out, color 0.15s ease-out, transform 0.1s ease-out",
  },
  moveButtonForward: {
    borderColor: colors.borderStrong,
    backgroundColor: {
      default: colors.surfaceTint,
      ":hover": colors.mist,
    },
    color: colors.ink,
  },
  emptyColumn: {
    display: "grid",
    placeItems: "center",
    paddingBlock: 36,
    paddingInline: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    textAlign: "center",
  },
  emptyText: {
    margin: 0,
    fontSize: 12,
    color: colors.muted,
    maxWidth: 210,
    lineHeight: 1.6,
  },
})
