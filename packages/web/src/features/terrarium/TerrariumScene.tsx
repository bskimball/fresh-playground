import { Button } from "@astryxdesign/core/Button"
import { IconButton } from "@astryxdesign/core/IconButton"
import * as stylex from "@stylexjs/stylex"
import { useEffect, useRef, useState } from "react"
import { media } from "../../styles/tokens.stylex.ts"
import {
  mountTerrarium,
  type SceneController,
  type SceneState,
  type SceneStatus,
} from "./scene/mount.ts"

export function TerrariumScene({ sunlight, night, waters }: SceneState) {
  const host = useRef<HTMLElement>(null)
  const controller = useRef<SceneController | null>(null)
  const latest = useRef<SceneState>({ sunlight, night, waters })
  const [status, setStatus] = useState<SceneStatus>("loading")
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    latest.current = { sunlight, night, waters }
    controller.current?.update(latest.current)
  }, [sunlight, night, waters])

  useEffect(() => {
    if (!host.current) return
    const scene = mountTerrarium(host.current, latest.current, setStatus)
    controller.current = scene
    return () => {
      scene.dispose()
      controller.current = null
    }
  }, [])

  const ready = status === "ready"

  return (
    <div {...stylex.props(styles.viewer)}>
      <div {...stylex.props(styles.scene)}>
        <div {...stylex.props(styles.orbit, night && styles.orbitNight)} aria-hidden="true" />
        <div {...stylex.props(styles.shadow)} aria-hidden="true" />
        {!ready && (
          <img
            {...stylex.props(styles.fallback, night && styles.fallbackNight)}
            src="/images/terrarium-whimsical.webp"
            width="960"
            height="960"
            alt="A whimsical garden in a glass bowl with pastel plants and mushrooms"
          />
        )}
        <section
          ref={host}
          {...stylex.props(styles.canvasHost, !ready && styles.hidden)}
          aria-label="Interactive 3D terrarium. Drag to rotate, scroll or pinch to zoom. Alternative controls are below."
        />
      </div>
      <section {...stylex.props(styles.controls)} aria-label="3D view controls">
        <IconButton
          label="Rotate left"
          icon={<span>↶</span>}
          isDisabled={!ready}
          onClick={() => controller.current?.rotate(-1)}
        />
        <IconButton
          label="Rotate right"
          icon={<span>↷</span>}
          isDisabled={!ready}
          onClick={() => controller.current?.rotate(1)}
        />
        <span {...stylex.props(styles.divider)} />
        <IconButton
          label="Zoom out"
          icon={<span>−</span>}
          isDisabled={!ready}
          onClick={() => controller.current?.zoom(-1)}
        />
        <IconButton
          label="Zoom in"
          icon={<span>+</span>}
          isDisabled={!ready}
          onClick={() => controller.current?.zoom(1)}
        />
        <span {...stylex.props(styles.divider)} />
        <Button
          label={spinning ? "Pause" : "Spin"}
          variant={spinning ? "primary" : "secondary"}
          isDisabled={!ready}
          aria-pressed={spinning}
          onClick={() => {
            controller.current?.spin(!spinning)
            setSpinning(!spinning)
          }}
        />
        <Button
          label="Reset view"
          isDisabled={!ready}
          onClick={() => {
            controller.current?.reset()
            setSpinning(false)
          }}
        />
      </section>
      <p {...stylex.props(styles.hint, night && styles.hintNight)} aria-live="polite">
        {ready
          ? "Drag to explore · Scroll or pinch to zoom"
          : status === "loading"
            ? "Growing your 3D world…"
            : "3D couldn’t load. Check your connection and WebGL support, then refresh."}
      </p>
    </div>
  )
}

const arrive = stylex.keyframes({
  from: { opacity: 0, transform: "translateY(12px)" },
  to: { opacity: 1, transform: "translateY(0)" },
})

const styles = stylex.create({
  viewer: { position: "relative" },
  scene: {
    height: { default: 398, [media.tablet]: 350, [media.mobile]: 370, [media.tiny]: 315 },
    position: "relative",
    display: "grid",
    placeItems: "center",
    marginTop: -14,
  },
  orbit: {
    position: "absolute",
    width: { default: 360, [media.tablet]: 290, [media.mobile]: 320, [media.tiny]: 260 },
    height: { default: 360, [media.tablet]: 290, [media.mobile]: 320, [media.tiny]: 260 },
    top: { default: 19, [media.tablet]: 38, [media.mobile]: 25 },
    maxWidth: "90%",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "light-dark(#dce4cd80, #b4c99430)",
    borderRadius: "50%",
    "::after": {
      content: '""',
      position: "absolute",
      inset: -25,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: "light-dark(#dce4cd70, #b4c99425)",
      borderRadius: "50%",
    },
  },
  orbitNight: {
    borderColor: "light-dark(#ffffff12, #ffffff12)",
    "::after": { borderColor: "light-dark(#ffffff12, #ffffff12)" },
  },
  shadow: {
    position: "absolute",
    bottom: -4,
    width: "58%",
    height: 30,
    borderRadius: "50%",
    backgroundColor: "light-dark(#64774522, #10170c66)",
    filter: "blur(15px)",
  },
  fallback: {
    position: "absolute",
    inset: 0,
    margin: "auto",
    zIndex: 1,
    width: { default: "min(94%, 460px)", [media.mobile]: "min(100%, 430px)" },
    height: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    display: "block",
    animationName: arrive,
    animationDuration: "1s",
    animationTimingFunction: "ease-out",
    transition: "filter 0.7s",
  },
  fallbackNight: { filter: "brightness(0.72) saturate(0.78)" },
  canvasHost: {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    cursor: { default: "grab", ":active": "grabbing" },
  },
  hidden: { visibility: "hidden" },
  controls: {
    position: "relative",
    zIndex: 3,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    paddingTop: 8,
    paddingInline: 12,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: "light-dark(#cbd5bf, #57634b)",
    marginInline: 3,
  },
  hint: {
    textAlign: "center",
    color: "light-dark(#76856b, #c0cdb2)",
    fontSize: 10,
    paddingInline: 20,
    marginTop: 8,
    marginBottom: 0,
  },
  hintNight: { color: "light-dark(#bdcabb, #c3d2c6)" },
})
