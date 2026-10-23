import { createPlantModels } from "./plant-models.js"

// Soft "clay" render of public/images/terrarium-whimsical.png. Three.js and its
// add-ons are supplied by this scene module's mount function.
/**
 * @param {HTMLElement} host
 * @param {import("./mount.ts").SceneState} initialState
 * @param {() => void} onContextLost
 */
export function createTerrarium(
  host,
  initialState,
  onContextLost,
  THREE,
  OrbitControls,
  RoomEnvironment,
) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z)
  const scene = new THREE.Scene()
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(Math.max(devicePixelRatio, 2), 3))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Neutral tone mapping keeps the pastel palette from washing out.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const canvas = renderer.domElement
  canvas.setAttribute("aria-hidden", "true")
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"
  canvas.style.touchAction = "none"
  host.appendChild(canvas)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environmentTarget = pmrem.fromScene(room, 0.04)
  scene.environment = environmentTarget.texture

  const target = v(0, 1.12, 0)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40)
  // A slightly raised, straight-on view, framed like the illustration.
  const elevation = THREE.MathUtils.degToRad(14)
  const distance = 6.3
  camera.position.set(0, target.y + Math.sin(elevation) * distance, Math.cos(elevation) * distance)
  const controls = new OrbitControls(camera, canvas)
  controls.target.copy(target)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enablePan = false
  controls.minDistance = 4.6
  controls.maxDistance = 10
  controls.minPolarAngle = 0.35
  controls.maxPolarAngle = Math.PI / 2 - 0.02
  controls.autoRotateSpeed = 0.6
  controls.update()
  controls.saveState()

  const hemi = new THREE.HemisphereLight(0xfffaf0, 0xb8a6cf, 1.1)
  scene.add(hemi)
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2)
  sun.position.set(-3, 6, 4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -2.5
  sun.shadow.camera.right = sun.shadow.camera.top = 2.5
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 4
  scene.add(sun)
  const fill = new THREE.DirectionalLight(0xd8f3ff, 0.7)
  fill.position.set(4, 2.5, 3)
  scene.add(fill)

  const garden = new THREE.Group()
  scene.add(garden)
  const clay = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra })
  const moss = (color) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.45,
      sheen: 0.18,
      sheenRoughness: 1,
      sheenColor: 0x9cc76a,
    })
  const materials = {
    soil: clay(0x78503c, { roughness: 1 }),
    stone: clay(0xb09ad9, { roughness: 0.92 }),
    cap: clay(0xf27f6f, { roughness: 0.7 }),
    spot: clay(0xfcd6ca, { roughness: 0.75 }),
    stalk: clay(0xf6cdb8),
    gills: clay(0xf3c3ad),
    moss: [moss(0x5b934f), moss(0x508657), moss(0x6faa55)],
  }

  function mesh(geometry, material, parent = garden) {
    const object = new THREE.Mesh(geometry, material)
    object.castShadow = true
    object.receiveShadow = true
    parent.add(object)
    return object
  }

  // Glass bowl: a squat fishbowl, widest below the middle, with a rolled rim.
  const bowlCurve = new THREE.SplineCurve([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.75, 0.01),
    new THREE.Vector2(1.18, 0.12),
    new THREE.Vector2(1.45, 0.42),
    new THREE.Vector2(1.56, 0.88),
    new THREE.Vector2(1.52, 1.38),
    new THREE.Vector2(1.36, 1.8),
    new THREE.Vector2(1.17, 2.08),
    new THREE.Vector2(1.1, 2.2),
  ])
  const bowlPoints = bowlCurve.getSpacedPoints(64)
  const bowlRadiusAt = (y) => {
    for (let i = 1; i < bowlPoints.length; i++) {
      const a = bowlPoints[i - 1]
      const b = bowlPoints[i]
      if (y >= a.y && y <= b.y) return a.x + ((y - a.y) / (b.y - a.y || 1)) * (b.x - a.x)
    }
    return bowlPoints.at(-1).x
  }

  // Milky aqua glass: clear enough over foliage, hazier at the base and silhouette.
  const glass = (side, baseAlpha, rimAlpha) =>
    new THREE.ShaderMaterial({
      uniforms: {
        inner: { value: new THREE.Color(0xb9e9e3) },
        edge: { value: new THREE.Color(0x99e1de) },
        baseAlpha: { value: baseAlpha },
        rimAlpha: { value: rimAlpha },
      },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;
        void main() {
          vHeight = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 inner;
        uniform vec3 edge;
        uniform float baseAlpha;
        uniform float rimAlpha;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vHeight;
        void main() {
          vec3 n = normalize(vNormal);
          if (!gl_FrontFacing) n = -n;
          float facing = clamp(abs(dot(n, normalize(vView))), 0.0, 1.0);
          float fresnel = pow(1.0 - facing, 1.65);
          float lowerHaze = 1.0 - smoothstep(0.1, 1.45, vHeight);
          float innerGlow = exp(-pow((facing - 0.22) / 0.2, 2.0)) * 0.12;
          vec3 h = normalize(normalize(vec3(-0.45, 0.65, 0.6)) + normalize(vView));
          float spec = pow(max(dot(n, h), 0.0), 38.0) * 0.22;
          vec3 color = mix(inner, edge, fresnel) + spec + innerGlow;
          gl_FragColor = vec4(color, clamp(baseAlpha + lowerHaze * 0.09 + fresnel * rimAlpha + spec, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      side,
    })
  const bowlGeometry = new THREE.LatheGeometry(bowlPoints, 96)
  const glassParts = []
  for (const [side, base, rim, order] of [
    [THREE.BackSide, 0.17, 0.45, 1],
    [THREE.FrontSide, 0.12, 0.72, 3],
  ]) {
    const part = new THREE.Mesh(bowlGeometry, glass(side, base, rim))
    part.renderOrder = order
    scene.add(part)
    glassParts.push(part)
  }
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(1.12, 0.13, 32, 128),
    // A lit rolled lip gives the milk glass an actual rounded cross-section.
    new THREE.MeshPhysicalMaterial({
      color: 0xa6e1dd,
      roughness: 0.26,
      metalness: 0,
      clearcoat: 0.65,
      clearcoatRoughness: 0.22,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
      emissive: 0x75aaa6,
      emissiveIntensity: 0.12,
    }),
  )
  rim.rotation.x = Math.PI / 2
  rim.position.y = 2.22
  rim.renderOrder = 4
  scene.add(rim)
  glassParts.push(rim)

  // Soil fills the bottom of the bowl, with a softly rounded top edge.
  const groundY = 0.86
  const soilProfile = []
  for (let i = 0; i <= 16; i++) {
    const y = 0.035 + (i / 16) * (groundY - 0.1)
    soilProfile.push(new THREE.Vector2(Math.max(0.01, bowlRadiusAt(y) - 0.04), y))
  }
  const edge = bowlRadiusAt(groundY) - 0.04
  soilProfile.push(new THREE.Vector2(edge - 0.02, groundY - 0.02))
  soilProfile.push(new THREE.Vector2(edge - 0.08, groundY))
  soilProfile.push(new THREE.Vector2(0, groundY))
  soilProfile.unshift(new THREE.Vector2(0, 0.035))
  const soil = mesh(new THREE.LatheGeometry(soilProfile, 96), materials.soil)
  soil.castShadow = false

  // Soft contact shading on the soil, independent of background and shadow-map resolution.
  const contactGeometry = new THREE.PlaneGeometry(2, 2)
  const contactMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        gl_FragColor = vec4(0.12, 0.085, 0.07, 0.24 * pow(max(0.0, 1.0 - r), 2.0));
        #include <colorspace_fragment>
      }`,
  })
  function contact(x, z, rx, rz) {
    const shadow = new THREE.Mesh(contactGeometry, contactMaterial)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.set(x, groundY + 0.003, z)
    shadow.scale.set(rx, rz, 1)
    garden.add(shadow)
  }

  // Moss mounds: half spheres resting on the soil.
  const dome = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)
  const mounds = [
    [-0.02, -0.12, 0.5, 0.82, 0],
    [0.2, 0.3, 0.3, 0.85, 1],
    [-0.1, 0.66, 0.26, 0.9, 0],
    [-0.42, 0.92, 0.13, 0.95, 2],
    [-0.62, 1.0, 0.1, 0.95, 0],
    [-0.3, 1.08, 0.08, 0.95, 1],
    [0.02, 1.02, 0.075, 0.95, 2],
    [-0.84, 0.5, 0.16, 0.9, 1],
    [-0.64, -0.08, 0.2, 0.9, 2],
    [0.76, 0.78, 0.16, 0.9, 0],
    [0.84, 0.22, 0.2, 0.9, 1],
    [0.42, -0.42, 0.22, 0.85, 2],
    [-0.42, -0.55, 0.24, 0.85, 1],
    [0.95, -0.35, 0.16, 0.9, 0],
  ]
  for (const [x, z, r, squash, shade] of mounds) {
    contact(x, z, r * 1.35, r * 1.35)
    const mound = mesh(dome, materials.moss[shade])
    mound.position.set(x, groundY - 0.01, z)
    mound.scale.set(r, r * squash, r)
  }

  // Soft polytopes: fourteen broad faces with rounded transitions, not smooth pills.
  // A log-sum-exp intersection rounds the edges between planes; the horizontal
  // top plane keeps the broad tabletop facet visible even on the smallest pebble.
  function stoneGeometry(seed) {
    const planes = [
      { normal: v(0, 1, 0), offset: 0.76 },
      { normal: v(0, -1, 0), offset: 0.8 },
    ]
    for (let ring = 0; ring < 2; ring++) {
      for (let face = 0; face < 6; face++) {
        const variation = Math.sin(seed * 13.7 + face * 7.3 + ring * 4.1)
        const angle = (face / 6) * Math.PI * 2 + ring * 0.28 + variation * 0.09
        planes.push({
          normal: v(Math.cos(angle), ring === 0 ? 0.65 : -0.55, Math.sin(angle)).normalize(),
          offset: 0.86 + variation * 0.045,
        })
      }
    }
    const geometry = new THREE.SphereGeometry(1, 64, 40)
    const positions = geometry.attributes.position
    const direction = v(0, 0, 0)
    const sharpness = 20
    for (let i = 0; i < positions.count; i++) {
      direction.fromBufferAttribute(positions, i).normalize()
      const distances = planes.map(({ normal, offset }) => direction.dot(normal) / offset)
      const largest = Math.max(...distances)
      const smoothMax =
        largest +
        Math.log(
          distances.reduce((sum, distance) => sum + Math.exp((distance - largest) * sharpness), 0),
        ) /
          sharpness
      direction.multiplyScalar(1 / smoothMax)
      positions.setXYZ(i, direction.x, direction.y, direction.z)
    }
    geometry.computeVertexNormals()
    return geometry
  }
  let stoneSeed = 0
  for (const [x, z, sx, sy, sz, turn] of [
    [0.38, 0.9, 0.4, 0.23, 0.27, 0.35],
    [-1.02, 0.55, 0.24, 0.17, 0.17, -0.4],
    [1.05, 0.5, 0.22, 0.16, 0.16, 0.5],
    [-0.15, -0.95, 0.2, 0.15, 0.14, 0.2],
  ]) {
    contact(x, z, sx * 1.2, sz * 1.3)
    const stone = mesh(stoneGeometry(++stoneSeed), materials.stone)
    stone.position.set(x, groundY + sy * 0.35, z)
    stone.scale.set(sx, sy, sz)
    stone.rotation.y = turn
  }

  // Spotted mushroom, front left.
  {
    const group = new THREE.Group()
    group.position.set(-0.55, groundY, 0.42)
    group.rotation.z = 0.08
    group.scale.setScalar(1.18)
    garden.add(group)
    const stalk = mesh(
      new THREE.LatheGeometry(
        [
          [0, 0],
          [0.19, 0],
          [0.2, 0.06],
          [0.16, 0.24],
          [0.13, 0.42],
          [0.12, 0.5],
          [0, 0.5],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        32,
      ),
      materials.stalk,
      group,
    )
    stalk.position.y = 0
    const capY = 0.46
    const capRadius = 0.42
    const capHeight = 0.72
    const cap = mesh(
      new THREE.SphereGeometry(capRadius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.cap,
      group,
    )
    cap.position.y = capY
    cap.scale.y = capHeight
    const underside = mesh(new THREE.CircleGeometry(capRadius, 48), materials.gills, group)
    underside.rotation.x = Math.PI / 2
    underside.position.y = capY + 0.001
    // Spots: flattened spheres pressed into the cap surface.
    const spotGeometry = new THREE.SphereGeometry(1, 20, 10)
    for (const [theta, phi, size] of [
      [0, 0.12, 0.085],
      [0.5, 0.62, 0.1],
      [1.9, 0.7, 0.09],
      [-0.9, 0.78, 0.075],
      [3.1, 0.6, 0.085],
      [-2.2, 0.55, 0.08],
      [2.6, 1.15, 0.06],
      [-0.2, 1.2, 0.065],
      [1.2, 1.2, 0.06],
    ]) {
      const normal = v(
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi) / capHeight,
        Math.sin(phi) * Math.cos(theta),
      )
      const surface = v(
        Math.sin(phi) * Math.sin(theta) * capRadius,
        Math.cos(phi) * capRadius * capHeight + capY,
        Math.sin(phi) * Math.cos(theta) * capRadius,
      )
      const spot = mesh(spotGeometry, materials.spot, group)
      spot.position.copy(surface)
      spot.quaternion.setFromUnitVectors(v(0, 1, 0), normal.normalize())
      spot.scale.set(size, 0.012, size)
      spot.castShadow = false
    }
  }

  const plants = createPlantModels(THREE, garden, groundY)

  const drops = new THREE.Group()
  const dropMaterial = new THREE.MeshBasicMaterial({
    color: 0xa0dceb,
    transparent: true,
    opacity: 0.85,
  })
  const dropGeometry = new THREE.SphereGeometry(1, 12, 8)
  for (let i = 0; i < 24; i++) {
    const angle = i * 2.4
    const radius = Math.sqrt((i + 0.5) / 24)
    const drop = new THREE.Mesh(dropGeometry, dropMaterial)
    drop.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    drop.scale.set(0.018, 0.065, 0.018)
    drops.add(drop)
  }
  scene.add(drops)

  let rainUntil = 0
  let state = initialState
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
  let visible = true
  let disposed = false
  const resize = () => {
    const { width, height } = host.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host)
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
  })
  intersection.observe(host)
  /** @param {import("./mount.ts").SceneState} next */
  function update(next) {
    if (next.waters > state.waters) rainUntil = performance.now() + 2400
    state = next
    sun.intensity = state.night ? 0.3 : 0.65 + state.sunlight / 95
    sun.color.set(state.night ? 0xb4c8ff : 0xfff1dc)
    hemi.intensity = state.night ? 0.35 : 1.1
    fill.intensity = state.night ? 0.7 : 0.5
    scene.environmentIntensity = state.night ? 0.3 : 0.7
  }
  function contextLost(event) {
    event.preventDefault()
    renderer.setAnimationLoop(null)
    onContextLost()
  }
  canvas.addEventListener("webglcontextlost", contextLost)
  resize()
  update(initialState)
  let previous = performance.now()
  renderer.setAnimationLoop((time) => {
    const delta = Math.min((time - previous) / 1000, 0.05)
    previous = time
    if (disposed || !visible || document.hidden) return
    controls.update(delta)
    plants.forEach((plant, i) => {
      plant.rotation.z = reducedMotion.matches ? 0 : Math.sin(time * 0.0007 + i) * 0.02
    })
    drops.visible = time < rainUntil && !reducedMotion.matches
    if (drops.visible) {
      drops.children.forEach((drop, i) => {
        drop.position.y = 2.6 - ((time * 0.002 + i * 0.37) % (2.6 - groundY))
      })
    }
    renderer.render(scene, camera)
  })
  return {
    update,
    /** @param {boolean} enabled */
    spin(enabled) {
      controls.autoRotate = enabled
    },
    /** @param {number} direction */
    rotate(direction) {
      const offset = camera.position.clone().sub(controls.target)
      offset.applyAxisAngle(v(0, 1, 0), (direction * Math.PI) / 8)
      camera.position.copy(controls.target).add(offset)
      controls.update()
    },
    /** @param {number} direction */
    zoom(direction) {
      const offset = camera.position.clone().sub(controls.target)
      offset.setLength(
        THREE.MathUtils.clamp(
          offset.length() * (direction > 0 ? 0.86 : 1.16),
          controls.minDistance,
          controls.maxDistance,
        ),
      )
      camera.position.copy(controls.target).add(offset)
      controls.update()
    },
    reset() {
      controls.autoRotate = false
      controls.reset()
    },
    dispose() {
      disposed = true
      renderer.setAnimationLoop(null)
      observer.disconnect()
      intersection.disconnect()
      canvas.removeEventListener("webglcontextlost", contextLost)
      controls.dispose()
      const geometries = new Set()
      const materialSet = new Set()
      scene.traverse((object) => {
        if (object.isMesh) {
          geometries.add(object.geometry)
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            materialSet.add(material)
        }
      })
      geometries.forEach((geometry) => {
        geometry.dispose()
      })
      materialSet.forEach((material) => {
        material.dispose()
      })
      environmentTarget.dispose()
      pmrem.dispose()
      sun.shadow.dispose()
      room.dispose?.()
      renderer.dispose()
      canvas.remove()
    },
  }
}
