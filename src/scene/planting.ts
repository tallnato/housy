/**
 * Planting: hedges, clipped shrubs, ornamental grasses and a handful of trees.
 *
 * Furniture rather than fabric, and made the same way as the rest of the model — out of
 * arithmetic, with nothing to load. Every plant is set down with `groundAt()` instead of at a
 * fixed level, because the plot falls about 2.2 m from the street to the back of the house and
 * anything laid flat either floats or buries itself.
 *
 * The whole lot hangs off one group, so the UI hides it in a single toggle.
 *
 * Same plan coordinate system as the rest of the model: plan (x, y) maps to world (x, z),
 * +Y is up and +Z points at the street.
 */

import * as THREE from 'three'
import { SIZE } from '../model/house'
import { DRIVEWAY, groundAt } from '../model/site'
import type { MaterialLibrary } from './materials'

// ─────────────────────────────────────────────────────────────────────────────
// Shared materials and geometries
// ─────────────────────────────────────────────────────────────────────────────

/** Foliage is faceted on purpose: it suits the low-poly forms and matches the rest of the scene. */
const foliage = (color: string, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.94, flatShading: true, side })

const HEDGE_LEAF = foliage('#3c5729')
const SHRUB_LEAF = [foliage('#43632f'), foliage('#4e6f38'), foliage('#375226')]
const OLIVE_LEAF = foliage('#8c9c7c')
const CONIFER_LEAF = foliage('#26411f')
/** Blades are single-sided ribbons, so they have to be drawn from both. */
const BLADE_LEAF = [
  foliage('#6f8a45', THREE.DoubleSide),
  foliage('#849b52', THREE.DoubleSide),
  foliage('#5c7a3e', THREE.DoubleSide),
]

const OLIVE_BARK = new THREE.MeshStandardMaterial({ color: '#a69c8d', roughness: 1, flatShading: true })
const CONIFER_BARK = new THREE.MeshStandardMaterial({ color: '#52443a', roughness: 1, flatShading: true })

const BALL = new THREE.IcosahedronGeometry(1, 1)
/** A unit trunk: 1 long, 1 across at the foot, tapering to 0.62 at the head. */
const STEM = new THREE.CylinderGeometry(0.62, 1, 1, 7, 1)
const TIER = new THREE.ConeGeometry(1, 1, 9, 1)
const UP = new THREE.Vector3(0, 1, 0)

/**
 * A seeded generator. The garden should be irregular, not different on every reload — with
 * `Math.random()` the plot would reshuffle itself each time the page is opened.
 */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const between = (r: () => number, a: number, b: number) => a + (b - a) * r()

function place(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// Where everything goes. Plan coordinates throughout, all of them checked clear of
// the house, the entrance steps, the driveway trench and the paved rear yard.
// ─────────────────────────────────────────────────────────────────────────────

interface HedgeRun {
  path: ReadonlyArray<readonly [number, number]>
  height: number
  width: number
}

/**
 * The street boundary drops 0.17 m across the width of the plot, which is under half a degree,
 * so a two-point run set 0.5 m inside it tracks the wall to within a centimetre.
 */
const HEDGES: readonly HedgeRun[] = [
  { path: [[-3.4, 15.94], [7.5, 16.02]], height: 0.62, width: 0.5 }, // inside the front wall
  { path: [[14.2, 16.07], [17.8, 16.1]], height: 0.62, width: 0.5 }, // ...and east of the vehicle gate
  { path: [[-2.45, 10.9], [-2.45, 14.85], [0.9, 14.91]], height: 0.48, width: 0.42 }, // terrace edge
]

/**
 * The one bed that lands on paving rather than lawn: a low kerbed strip at the foot of the
 * front wall, west of the entrance steps. Everything else is planted straight into the grass.
 */
const TERRACE_BED = { x0: 0.15, y0: 10.56, x1: 2.4, y1: 11.45, height: 0.14 }

interface ShrubRow {
  a: readonly [number, number]
  b: readonly [number, number]
  count: number
  /** Scales the ball radius, for the tighter beds. */
  size?: number
  /** Lifts the row onto a raised bed. */
  lift?: number
}

const SHRUB_ROWS: readonly ShrubRow[] = [
  { a: [-0.8, 1.3], b: [-0.8, 9.5], count: 7 }, // at the foot of the west flank
  { a: [SIZE.width + 0.8, 1.3], b: [SIZE.width + 0.8, 9.5], count: 7 }, // ...and the east flank
  { a: [0.6, -5.2], b: [13.4, -5.2], count: 6 }, // edging the rear yard, clear of its paving
  { a: [0.6, 11.05], b: [1.9, 11.05], count: 3, size: 0.75, lift: TERRACE_BED.height },
  { a: [DRIVEWAY.x1 + 0.75, 11.2], b: [DRIVEWAY.x1 + 0.75, 14.0], count: 4 }, // outside the drive wall
  { a: [14.7, 14.5], b: [17.3, 14.35], count: 3 }, // under the boundary hedge, east of the gate
]

const GRASS_TUFTS: ReadonlyArray<readonly [number, number]> = [
  [-3.3, 15.0], // the strip between the terrace and the left boundary
  [-3.5, 11.4],
  [-3.9, 6.2], // down the west flank
  [-3.2, 2.4],
  [-4.6, -1.8],
  [15.4, 11.4], // front lawn, east of the driveway
  [17.4, 14.1],
  [18.3, 9.4], // down the east flank
  [16.6, 2.8],
  [19.4, -1.2],
  [2.0, -5.7], // out in the rear garden
  [10.4, -5.9],
]

interface Tree {
  kind: 'olive' | 'conifer'
  x: number
  y: number
  height: number
}

const TREES: readonly Tree[] = [
  { kind: 'olive', x: -2.7, y: 7.8, height: 3.2 }, // beside the west flank
  { kind: 'olive', x: 16.3, y: 12.4, height: 2.9 }, // front lawn, east of the driveway
  { kind: 'olive', x: 17.1, y: 5.4, height: 3.4 }, // east flank
  { kind: 'conifer', x: -4.6, y: -8.4, height: 6.0 }, // rear-left corner of the plot
  { kind: 'conifer', x: 20.4, y: -6.4, height: 5.4 }, // rear-right corner
]

// ─────────────────────────────────────────────────────────────────────────────
// Hedge: a ribbon of quads along a polyline, the way the boundary wall is built.
// A row of boxes would either float or sink wherever the ground moves under it.
// ─────────────────────────────────────────────────────────────────────────────

function buildHedge(run: HedgeRun): THREE.Mesh {
  // Densify the polyline first: the top and both faces are sampled per station, and the ground
  // moves too much across a long chord for the ends alone to describe it.
  const pts: Array<[number, number]> = []
  for (let i = 0; i < run.path.length - 1; i++) {
    const [x0, y0] = run.path[i]
    const [x1, y1] = run.path[i + 1]
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.35))
    for (let k = 0; k < steps; k++) {
      const t = k / steps
      pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t])
    }
  }
  const end = run.path[run.path.length - 1]
  pts.push([end[0], end[1]])

  const segN: Array<[number, number]> = []
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0]
    const dy = pts[i + 1][1] - pts[i][1]
    const l = Math.hypot(dx, dy) || 1
    segN.push([-dy / l, dx / l])
  }

  const off = pts.map((_, i) => {
    const a = segN[Math.max(0, i - 1)]
    const b = segN[Math.min(segN.length - 1, i)]
    let mx = a[0] + b[0]
    let my = a[1] + b[1]
    const l = Math.hypot(mx, my) || 1
    mx /= l
    my /= l
    // A mitred corner needs a longer offset than the two runs meeting at it, or the hedge
    // pinches to nothing where it turns. Clamped, so a hairpin cannot blow the offset up.
    const k = run.width / 2 / Math.max(0.4, mx * b[0] + my * b[1])
    return [mx * k, my * k] as [number, number]
  })

  const base: number[] = []
  const top: number[] = []
  const phase = run.path[0][0]
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    // Below grade at the foot, so no gap opens where the ground is sampled between stations.
    const z = groundAt(pts[i][0], pts[i][1]) - 0.07
    base.push(z)
    // A clipped hedge is never quite level. Two frequencies of shallow wobble along the run
    // keep the top from reading as a card cut to shape.
    top.push(z + run.height + 0.045 * Math.sin(s * 2.1 + phase) + 0.026 * Math.sin(s * 5.3 - phase))
  }

  const verts: number[] = []
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    verts.push(...a, ...b, ...c, ...a, ...c, ...d)
  }
  const p = (i: number, side: number, y: number) => [
    pts[i][0] + off[i][0] * side,
    y,
    pts[i][1] + off[i][1] * side,
  ]

  for (let i = 0; i < pts.length - 1; i++) {
    const j = i + 1
    quad(p(i, 1, base[i]), p(j, 1, base[j]), p(j, 1, top[j]), p(i, 1, top[i]))
    quad(p(j, -1, base[j]), p(i, -1, base[i]), p(i, -1, top[i]), p(j, -1, top[j]))
    quad(p(i, 1, top[i]), p(j, 1, top[j]), p(j, -1, top[j]), p(i, -1, top[i]))
  }
  // Both ends, so the run does not read as a hollow trough from the side.
  const n = pts.length - 1
  quad(p(0, -1, base[0]), p(0, 1, base[0]), p(0, 1, top[0]), p(0, -1, top[0]))
  quad(p(n, 1, base[n]), p(n, -1, base[n]), p(n, -1, top[n]), p(n, 1, top[n]))

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, HEDGE_LEAF)
  m.name = 'hedge'
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// ─────────────────────────────────────────────────────────────────────────────
// Shrubs, grasses and trees
// ─────────────────────────────────────────────────────────────────────────────

/** A clipped ball: squashed, tipped and turned, so no two in a row are the same object twice. */
function shrub(x: number, y: number, size: number, lift: number, r: () => number): THREE.Mesh {
  const radius = between(r, 0.26, 0.44) * size
  const squash = between(r, 0.66, 0.84)
  const m = new THREE.Mesh(BALL, SHRUB_LEAF[Math.floor(r() * SHRUB_LEAF.length)])
  m.scale.set(radius * between(r, 0.92, 1.08), radius * squash, radius)
  m.rotation.set(between(r, -0.14, 0.14), r() * Math.PI * 2, between(r, -0.14, 0.14))
  // Set a little low, so the ball sits in the grass rather than balancing on it.
  m.position.set(x, groundAt(x, y) + lift + radius * squash * 0.84, y)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

const BLADES = 12

/** One tuft, whole: a dozen blades in a single geometry rather than a dozen meshes. */
function grassTuft(x: number, y: number, r: () => number): THREE.Mesh {
  const height = between(r, 0.45, 0.85)
  const lean = between(r, 0.18, 0.34)
  const verts: number[] = []

  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + between(r, -0.26, 0.26)
    const dx = Math.cos(a)
    const dz = Math.sin(a)
    const h = height * between(r, 0.6, 1)
    const out = lean * between(r, 0.7, 1.3)
    const halfWidth = between(r, 0.014, 0.024)
    let prev: number[][] | null = null
    for (let k = 0; k <= 3; k++) {
      const t = k / 3
      const w = Math.max(0.003, halfWidth * (1 - t) ** 0.8)
      // The blade rises fast and then bends away as it runs out of stiffness.
      const rad = out * t * t
      const yy = h * t * (1 - 0.2 * t * t)
      const cur = [
        [dx * rad - dz * w, yy, dz * rad + dx * w],
        [dx * rad + dz * w, yy, dz * rad - dx * w],
      ]
      if (prev) verts.push(...prev[0], ...prev[1], ...cur[1], ...prev[0], ...cur[1], ...cur[0])
      prev = cur
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, BLADE_LEAF[Math.floor(r() * BLADE_LEAF.length)])
  m.name = 'grass'
  m.position.set(x, groundAt(x, y) - 0.03, y)
  m.rotation.y = r() * Math.PI * 2
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A tapered cylinder between two points — trunks and limbs. */
function stem(from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
  const dir = to.clone().sub(from)
  const len = dir.length()
  const m = new THREE.Mesh(STEM, mat)
  m.scale.set(radius, len, radius)
  m.quaternion.setFromUnitVectors(UP, dir.normalize())
  m.position.copy(from).addScaledVector(dir, len / 2)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function olive(t: Tree, r: () => number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'olive'
  const z = groundAt(t.x, t.y)
  const h = t.height
  const trunkR = h * 0.042
  const root = new THREE.Vector3(t.x, z - 0.2, t.y)
  const crotch = new THREE.Vector3(
    t.x + between(r, -0.07, 0.07),
    z + h * between(r, 0.26, 0.36),
    t.y + between(r, -0.07, 0.07),
  )
  g.add(stem(root, crotch, trunkR, OLIVE_BARK))

  // Two or three limbs off a short trunk: the multi-stem habit the photographs show.
  const limbs = 2 + Math.floor(r() * 2)
  const twist = r() * Math.PI * 2
  const tips: THREE.Vector3[] = []
  for (let i = 0; i < limbs; i++) {
    const a = twist + (i / limbs) * Math.PI * 2 + between(r, -0.35, 0.35)
    const reach = h * between(r, 0.13, 0.24)
    const tip = new THREE.Vector3(
      crotch.x + Math.cos(a) * reach,
      crotch.y + h * between(r, 0.26, 0.4),
      crotch.z + Math.sin(a) * reach,
    )
    g.add(stem(crotch, tip, trunkR * between(r, 0.5, 0.72), OLIVE_BARK))
    tips.push(tip)
  }

  // Three or four flattened blobs hung off the limbs and overlapping, so the canopy reads open
  // and silvery instead of as one ball on a stick.
  const blobs = 3 + Math.floor(r() * 2)
  for (let i = 0; i < blobs; i++) {
    const tip = tips[i % tips.length]
    const rad = h * between(r, 0.15, 0.22)
    const m = new THREE.Mesh(BALL, OLIVE_LEAF)
    m.scale.set(rad, rad * between(r, 0.52, 0.7), rad * between(r, 0.85, 1.15))
    m.rotation.set(between(r, -0.25, 0.25), r() * Math.PI * 2, between(r, -0.25, 0.25))
    m.position.set(
      tip.x + between(r, -0.28, 0.28) * h * 0.3,
      tip.y + between(r, -0.04, 0.12) * h,
      tip.z + between(r, -0.28, 0.28) * h * 0.3,
    )
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  return g
}

function conifer(t: Tree, r: () => number): THREE.Group {
  const g = new THREE.Group()
  g.name = 'conifer'
  const z = groundAt(t.x, t.y)
  const h = t.height
  g.add(
    stem(
      new THREE.Vector3(t.x, z - 0.25, t.y),
      new THREE.Vector3(t.x, z + h * 0.3, t.y),
      h * 0.03,
      CONIFER_BARK,
    ),
  )

  // A stack of cones, each narrower and shorter-lived than the one below, overlapping by about
  // two thirds. The topmost lands within a few centimetres of the nominal height.
  const tiers = 4 + Math.floor(r() * 2)
  const spread = h * between(r, 0.19, 0.25)
  const tall = h * 0.34
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers
    const rad = spread * (1 - f * 0.8) * between(r, 0.92, 1.06)
    const m = new THREE.Mesh(TIER, CONIFER_LEAF)
    m.scale.set(rad, tall, rad)
    m.rotation.set(between(r, -0.03, 0.03), r() * Math.PI * 2, between(r, -0.03, 0.03))
    m.position.set(
      t.x + between(r, -0.05, 0.05),
      z + h * (0.1 + 0.68 * f) + tall / 2,
      t.y + between(r, -0.05, 0.05),
    )
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────────

/** Hedges, shrubs and trees, laid on the finished ground. */
export function buildPlanting(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'planting'
  const r = rng(0x5eed17)

  for (const run of HEDGES) g.add(buildHedge(run))

  const b = TERRACE_BED
  const bx = (b.x0 + b.x1) / 2
  const by = (b.y0 + b.y1) / 2
  g.add(
    place(
      new THREE.BoxGeometry(b.x1 - b.x0, b.height, b.y1 - b.y0),
      lib.get('terrace'),
      bx,
      groundAt(bx, by) + b.height / 2,
      by,
    ),
  )

  for (const row of SHRUB_ROWS) {
    const [ax, ay] = row.a
    const [px, py] = row.b
    const len = Math.hypot(px - ax, py - ay) || 1
    const ux = (px - ax) / len
    const uy = (py - ay) / len
    for (let i = 0; i < row.count; i++) {
      const t = row.count === 1 ? 0.5 : i / (row.count - 1)
      const along = between(r, -0.15, 0.15)
      const across = between(r, -0.12, 0.12)
      const x = ax + (px - ax) * t + ux * along - uy * across
      const y = ay + (py - ay) * t + uy * along + ux * across
      g.add(shrub(x, y, row.size ?? 1, row.lift ?? 0, r))
    }
  }

  for (const [x, y] of GRASS_TUFTS) g.add(grassTuft(x, y, r))
  for (const t of TREES) g.add(t.kind === 'olive' ? olive(t, r) : conifer(t, r))

  return g
}
