export type SceneState = { sunlight: number; night: boolean; waters: number }
export type SceneStatus = "loading" | "ready" | "error"
type Renderer = ReturnType<typeof import("./terrarium-scene.js").createTerrarium>

/** Owns the scene from asynchronous loading through disposal, including early unmounts. */
export function mountTerrarium(
  host: HTMLElement,
  initialState: SceneState,
  onStatus: (status: SceneStatus) => void,
) {
  let disposed = false
  let state = initialState
  let renderer: Renderer | undefined
  onStatus("loading")
  Promise.all([
    import("./terrarium-scene.js"),
    import("three"),
    import("three/examples/jsm/controls/OrbitControls.js"),
    import("three/examples/jsm/environments/RoomEnvironment.js"),
  ])
    .then(([module, THREE, { OrbitControls }, { RoomEnvironment }]) => {
      if (disposed) return
      renderer = module.createTerrarium(
        host,
        state,
        () => {
          if (!disposed) onStatus("error")
        },
        THREE,
        OrbitControls,
        RoomEnvironment,
      )
      onStatus("ready")
    })
    .catch((error: unknown) => {
      if (disposed) return
      console.error("Terrarium 3D could not load", error)
      onStatus("error")
    })

  return {
    update(next: SceneState) {
      state = next
      renderer?.update(next)
    },
    rotate(direction: number) {
      renderer?.rotate(direction)
    },
    zoom(direction: number) {
      renderer?.zoom(direction)
    },
    spin(enabled: boolean) {
      renderer?.spin(enabled)
    },
    reset() {
      renderer?.reset()
    },
    dispose() {
      if (disposed) return
      disposed = true
      renderer?.dispose()
      renderer = undefined
    },
  }
}

export type SceneController = ReturnType<typeof mountTerrarium>
