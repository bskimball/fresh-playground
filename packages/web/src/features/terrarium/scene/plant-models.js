// Stylized "clay" plants matching public/images/terrarium-whimsical.png:
// a round-leaf plant in the middle, golden teardrop leaves on the right, and
// small round-cap sprouts along the glass. Smooth normals and broad painted
// midribs keep the rounded blades soft even at small canvas sizes.
export function createPlantModels(THREE, garden, groundY) {
  const v = (x, y, z) => new THREE.Vector3(x, y, z)
  const plants = []

  const clay = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...extra })
  const materials = {
    leaf: clay(0xffffff, { vertexColors: true, side: THREE.DoubleSide }),
    golden: clay(0xffd062, { side: THREE.DoubleSide }),
    stem: clay(0x5c9d49),
    sprout: clay(0x5ea64d, { side: THREE.DoubleSide }),
  }

  // Leaf in local space: base at the origin, tip along +Y, face toward +Z.
  // `point` sharpens the tip; `cup` and `fold` bend the blade.
  function leafGeometry({
    length,
    width,
    cup = 0.12,
    fold = 0.06,
    point = 0.15,
    segments = 48,
    rings = 12,
    midrib = false,
  }) {
    const positions = []
    const colors = []
    const surface = (x, y) => {
      const nx = x / (width / 2)
      const ny = (y - length / 2) / (length / 2)
      const radius = Math.min(1, nx * nx + ny * ny)
      return (
        cup * length * radius * 0.5 +
        width * 0.13 * Math.sqrt(Math.max(0, 1 - radius)) +
        fold * width * (Math.sqrt(nx * nx + 0.012) - 0.11)
      )
    }
    positions.push(0, length / 2, surface(0, length / 2))
    for (let ring = 1; ring <= rings; ring++) {
      const t = ring / rings
      for (let seg = 0; seg < segments; seg++) {
        const angle = (seg / segments) * Math.PI * 2
        const x = Math.sin(angle) * (width / 2) * t
        let y = length / 2 - Math.cos(angle) * (length / 2) * t
        // Stretch the half opposite the base into a soft point.
        if (Math.cos(angle) < 0) y += (-Math.cos(angle)) ** 4 * point * length * t
        positions.push(x, y, surface(x, y))
      }
    }
    const index = []
    for (let seg = 0; seg < segments; seg++) {
      index.push(0, 1 + seg, 1 + ((seg + 1) % segments))
    }
    for (let ring = 1; ring < rings; ring++) {
      const inner = 1 + (ring - 1) * segments
      const outer = inner + segments
      for (let seg = 0; seg < segments; seg++) {
        const next = (seg + 1) % segments
        index.push(inner + seg, outer + seg, outer + next, inner + seg, outer + next, inner + next)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    if (midrib) {
      const green = new THREE.Color(0x78b86a)
      const stripe = new THREE.Color(0xc7df87)
      for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] / width
        const y = positions[i + 1] / length
        const band = Math.exp(-Math.pow(x / (0.052 + 0.025 * (1 - y)), 2))
        const color = green.clone().lerp(stripe, band * 0.82)
        colors.push(color.r, color.g, color.b)
      }
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    }
    geometry.setIndex(index)
    geometry.computeVertexNormals()
    return { geometry, surface }
  }

  function mesh(geometry, material, parent) {
    const object = new THREE.Mesh(geometry, material)
    object.castShadow = true
    object.receiveShadow = true
    parent.add(object)
    return object
  }

  function stem(parent, points, radius) {
    const curve = new THREE.CatmullRomCurve3(points)
    mesh(new THREE.TubeGeometry(curve, 32, radius, 12), materials.stem, parent)
    return curve
  }

  // Orient a leaf so its axis follows `direction` and its face looks toward `facing`.
  function placeLeaf(object, position, direction, facing) {
    const y = direction.clone().normalize()
    const z = facing
      .clone()
      .sub(y.clone().multiplyScalar(facing.dot(y)))
      .normalize()
    const x = new THREE.Vector3().crossVectors(y, z)
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))
    object.position.copy(position)
  }

  function leaf(parent, options, material, position, direction, facing, midrib = false) {
    const group = new THREE.Group()
    const { geometry } = leafGeometry({ ...options, midrib })
    mesh(geometry, material, group)
    placeLeaf(group, position, direction, facing)
    parent.add(group)
    return group
  }

  function plant(x, z, baseY = groundY) {
    const group = new THREE.Group()
    group.position.set(x, baseY, z)
    garden.add(group)
    plants.push(group)
    return group
  }

  // Round-leaf plant growing out of the central moss mound.
  {
    const group = plant(-0.02, -0.12, groundY + 0.28)
    group.scale.setScalar(0.78)
    const front = v(0.05, 0.35, 1)
    const stems = [
      {
        tip: [-0.18, 0.85, 0.05],
        mid: [-0.04, 0.45, -0.02],
        dir: [-0.35, 0.8, 0.25],
        length: 0.86,
        width: 0.84,
      },
      {
        tip: [0.42, 0.6, 0.1],
        mid: [0.18, 0.34, 0],
        dir: [0.6, 0.6, 0.3],
        length: 0.66,
        width: 0.64,
      },
      {
        tip: [-0.3, 0.62, 0.12],
        mid: [-0.12, 0.32, 0.03],
        dir: [-0.6, 0.6, 0.35],
        length: 0.48,
        width: 0.46,
      },
    ]
    for (const s of stems) {
      stem(group, [v(0, 0, 0), v(...s.mid), v(...s.tip)], 0.036)
      leaf(
        group,
        { length: s.length, width: s.width, cup: 0.14, fold: 0.05, point: 0.06, segments: 48 },
        materials.leaf,
        v(...s.tip),
        v(...s.dir),
        front,
        true,
      )
    }
  }

  // Golden teardrop leaves on slender, arching stems.
  {
    const group = plant(0.68, 0.02)
    group.scale.setScalar(0.95)
    const front = v(-0.1, 0.2, 1)
    const leaves = [
      {
        tip: [0.2, 0.72, 0.0],
        mid: [0.05, 0.38, 0.02],
        dir: [0.35, 0.9, 0.15],
        length: 0.5,
        width: 0.38,
      },
      {
        tip: [-0.28, 0.55, 0.06],
        mid: [-0.05, 0.32, 0.02],
        dir: [-0.7, 0.6, 0.25],
        length: 0.4,
        width: 0.3,
      },
      {
        tip: [-0.12, 0.22, 0.25],
        mid: [-0.02, 0.12, 0.1],
        dir: [-0.55, 0.55, 0.55],
        length: 0.34,
        width: 0.26,
      },
      {
        tip: [0.32, 0.24, 0.2],
        mid: [0.12, 0.12, 0.1],
        dir: [0.55, 0.5, 0.6],
        length: 0.34,
        width: 0.26,
      },
    ]
    for (const l of leaves) {
      stem(group, [v(0, 0, 0), v(...l.mid), v(...l.tip)], 0.02)
      leaf(
        group,
        {
          length: l.length,
          width: l.width,
          cup: 0.16,
          fold: 0.06,
          point: 0.3,
          segments: 48,
          rings: 12,
        },
        materials.golden,
        v(...l.tip),
        v(...l.dir),
        front,
      )
    }
  }

  // Round-cap sprouts near the glass.
  const sproutCap = new THREE.SphereGeometry(1, 32, 16)
  for (const [x, z, sprouts] of [
    [
      -1.05,
      0.12,
      [
        [0, 0.32, 0, 0.11],
        [0.12, 0.2, 0.08, 0.08],
        [-0.08, 0.16, 0.12, 0.07],
      ],
    ],
    [
      1.12,
      0.12,
      [
        [0, 0.3, 0, 0.1],
        [-0.12, 0.2, 0.1, 0.08],
        [0.06, 0.14, 0.15, 0.065],
      ],
    ],
    [
      -0.35,
      -0.7,
      [
        [0, 0.26, 0, 0.09],
        [0.12, 0.16, 0.05, 0.07],
      ],
    ],
  ]) {
    const group = plant(x, z)
    for (const [sx, height, sz, radius] of sprouts) {
      const top = v(sx, height, sz)
      stem(group, [v(sx * 0.3, 0, sz * 0.3), v(sx * 0.7, height * 0.6, sz * 0.6), top], 0.016)
      const cap = mesh(sproutCap, materials.sprout, group)
      cap.position.copy(top)
      cap.scale.set(radius, radius * 0.3, radius)
      cap.quaternion.setFromUnitVectors(v(0, 1, 0), v(sx * 2, 1.4, 0.8 + sz).normalize())
    }
  }

  return plants
}
