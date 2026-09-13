/**
 * Builds the three.js scene graph from the model data.
 *
 * The house is solid geometry, not a cut-out shell: a wall with openings in it is emitted as
 * the piers, lintels and spandrels that are actually left standing. That keeps the mesh exact
 * (no CSG, no z-fighting at the reveals) and means a window reveal has real depth when you
 * fly the camera through it.
 *
 * Plan (x, y) maps to world (x, z); elevation maps to world y. So +Y is up and +Z faces the
 * street.
 */

import * as THREE from 'three'
import {
  CAVE_WALLS,
  GROUND_WALLS,
  LEVELS,
  ROOF_EDGE,
  ROOMS,
  SIZE,
  STAIR,
  type Level,
  type Opening,
  type Room,
  type Wall,
} from '../model/house'
import { BOUNDARY, DRIVEWAY, ENTRANCE_STEPS, PLOT, groundAt } from '../model/site'
import type { MaterialLibrary } from './materials'
import type { SurfaceId } from '../model/finishes'

/** Named parts of the scene, so the UI can show and hide them. */
export interface HouseParts {
  root: THREE.Group
  cave: THREE.Group
  ground: THREE.Group
  /** The roof build-up: band, upstand and gravel. */
  roof: THREE.Group
  /** Structural slab over the ground floor — hidden whenever you look down into it. */
  slabOverGround: THREE.Object3D
  /** Structural slab over the basement. */
  slabOverCave: THREE.Object3D
  glazing: THREE.Group
  site: THREE.Group
  stairs: THREE.Group
  furniture: THREE.Group
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/**
 * A wall slab between two plan positions, at a fixed elevation band.
 * `run` picks which plan axis the length runs along.
 */
function slab(
  run: 'x' | 'y',
  at: number,
  from: number,
  to: number,
  thickness: number,
  base: number,
  top: number,
  mat: THREE.Material,
): THREE.Mesh | null {
  const len = to - from
  const h = top - base
  if (len <= 1e-4 || h <= 1e-4) return null
  const geo = run === 'x' ? box(len, h, thickness) : box(thickness, h, len)
  const cx = run === 'x' ? from + len / 2 : at
  const cz = run === 'x' ? at : from + len / 2
  return mesh(geo, mat, cx, base + h / 2, cz)
}

// ─────────────────────────────────────────────────────────────────────────────
// Walls
// ─────────────────────────────────────────────────────────────────────────────

function buildWall(wall: Wall, lib: MaterialLibrary): THREE.Group {
  const group = new THREE.Group()
  group.name = wall.id

  const floor = wall.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
  const ceil = wall.level === 'cave' ? LEVELS.caveCeiling : LEVELS.groundCeiling
  const base = wall.base ?? floor
  // Exterior walls run up behind the slab to the underside of the level above.
  const top = wall.top ?? (wall.exterior ? (wall.level === 'cave' ? LEVELS.groundFloor : LEVELS.roofSlab) : ceil)

  const mat = lib.get(wall.exterior ? 'exteriorWall' : 'interiorWall')
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.from - b.from)

  let cursor = wall.from
  for (const o of openings) {
    const from = Math.max(o.from, wall.from)
    const to = Math.min(o.to, wall.to)
    if (to <= cursor) continue

    // Pier before the opening
    const pier = slab(wall.run, wall.at, cursor, from, wall.thickness, base, top, mat)
    if (pier) group.add(pier)

    // Spandrel below the sill and lintel above the head
    const below = slab(wall.run, wall.at, from, to, wall.thickness, base, o.sill, mat)
    if (below) group.add(below)
    const above = slab(wall.run, wall.at, from, to, wall.thickness, o.head, top, mat)
    if (above) group.add(above)

    cursor = to
  }
  const last = slab(wall.run, wall.at, cursor, wall.to, wall.thickness, base, top, mat)
  if (last) group.add(last)

  return group
}

// ─────────────────────────────────────────────────────────────────────────────
// Glazing: a frame around the reveal plus mullioned panes.
// ─────────────────────────────────────────────────────────────────────────────

const FRAME = 0.06

function buildGlazing(wall: Wall, o: Opening, lib: MaterialLibrary): THREE.Group | null {
  if (o.kind === 'door' || o.kind === 'opening') return null
  const g = new THREE.Group()
  const frameMat = lib.get('frame')
  const glassMat = lib.get('glass')
  const width = o.to - o.from
  const height = o.head - o.sill
  if (width <= 0 || height <= 0) return null

  const depth = Math.min(wall.thickness * 0.55, 0.12)
  const mid = o.from + width / 2
  const cy = o.sill + height / 2

  const place = (
    lengthAlong: number,
    h: number,
    alongCentre: number,
    yCentre: number,
    m: THREE.Material,
    thick = depth,
  ) => {
    const geo = wall.run === 'x' ? box(lengthAlong, h, thick) : box(thick, h, lengthAlong)
    const x = wall.run === 'x' ? alongCentre : wall.at
    const z = wall.run === 'x' ? wall.at : alongCentre
    const mm = mesh(geo, m, x, yCentre, z)
    mm.castShadow = false
    g.add(mm)
  }

  // Outer frame
  place(width, FRAME, mid, o.sill + FRAME / 2, frameMat)
  place(width, FRAME, mid, o.head - FRAME / 2, frameMat)
  place(FRAME, height, o.from + FRAME / 2, cy, frameMat)
  place(FRAME, height, o.to - FRAME / 2, cy, frameMat)

  // The garage door is a solid panel, not glass.
  if (o.kind === 'garage') {
    place(width - FRAME * 2, height - FRAME * 2, mid, cy, frameMat, depth * 0.8)
    return g
  }

  // Mullions: panes of at most ~1.10 m.
  const panes = Math.max(1, Math.round(width / 1.1))
  for (let i = 1; i < panes; i++) {
    place(FRAME * 0.7, height - FRAME * 2, o.from + (width * i) / panes, cy, frameMat)
  }
  // Transom, where the elevations show one: 0.95 m up on the tall openings.
  const hasTransom = height > 1.6
  if (hasTransom) place(width - FRAME * 2, FRAME * 0.7, mid, o.sill + 0.95, frameMat)

  // Glass, inset behind the frame
  place(width - FRAME * 2, height - FRAME * 2, mid, cy, glassMat, depth * 0.35)
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Slabs, roof and the band that runs round it
// ─────────────────────────────────────────────────────────────────────────────

interface Slabs {
  raft: THREE.Mesh
  /** Basement ceiling / ground floor structure. */
  overCave: THREE.Mesh
  /** Ground floor ceiling / roof structure. */
  overGround: THREE.Mesh
}

function buildSlabs(lib: MaterialLibrary): Slabs {
  // A hair inside the wall faces. Flush would put the slab edge exactly on the façade plane,
  // and the two surfaces flicker along it.
  const W = SIZE.width - 0.02
  const D = SIZE.depth - 0.02

  const raft = mesh(
    box(W, LEVELS.caveFloor - LEVELS.caveBase, D),
    lib.get('floorGarage'),
    SIZE.width / 2,
    (LEVELS.caveBase + LEVELS.caveFloor) / 2,
    SIZE.depth / 2,
  )

  // The deep transfer slab that spans the column-free garage below.
  const gfThick = LEVELS.groundFloor - LEVELS.caveCeiling
  const overCave = mesh(box(W, gfThick, D), lib.get('ceiling'), SIZE.width / 2, LEVELS.caveCeiling + gfThick / 2, SIZE.depth / 2)

  const roofThick = LEVELS.roofSlab - LEVELS.groundCeiling
  const overGround = mesh(box(W, roofThick, D), lib.get('ceiling'), SIZE.width / 2, LEVELS.groundCeiling + roofThick / 2, SIZE.depth / 2)

  return { raft, overCave, overGround }
}

function buildRoof(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'roof'
  const W = SIZE.width
  const D = SIZE.depth
  const p = ROOF_EDGE.palaProjection
  const t = ROOF_EDGE.parapetThickness

  // The projecting white band: a ring of four slabs around the building, 0.30 deep, 0.30 tall.
  const palaH = LEVELS.palaTop - LEVELS.palaBottom
  const palaY = LEVELS.palaBottom + palaH / 2
  const palaMat = lib.get('pala')
  g.add(mesh(box(W + 2 * p, palaH, p), palaMat, W / 2, palaY, -p / 2))
  g.add(mesh(box(W + 2 * p, palaH, p), palaMat, W / 2, palaY, D + p / 2))
  g.add(mesh(box(p, palaH, D), palaMat, -p / 2, palaY, D / 2))
  g.add(mesh(box(p, palaH, D), palaMat, W + p / 2, palaY, D / 2))
  // ...and the face of the band across the building itself
  g.add(mesh(box(W, palaH, D), palaMat, W / 2, palaY, D / 2))

  // Upstand above it, set in from the wall face by its own thickness
  const parH = LEVELS.parapetTop - LEVELS.palaTop
  const parY = LEVELS.palaTop + parH / 2
  const parMat = lib.get('parapet')
  g.add(mesh(box(W, parH, t), parMat, W / 2, parY, t / 2))
  g.add(mesh(box(W, parH, t), parMat, W / 2, parY, D - t / 2))
  g.add(mesh(box(t, parH, D - 2 * t), parMat, t / 2, parY, D / 2))
  g.add(mesh(box(t, parH, D - 2 * t), parMat, W - t / 2, parY, D / 2))

  // Washed gravel, sitting between the upstands
  const roofH = LEVELS.roofSurface - LEVELS.palaTop
  g.add(
    mesh(
      box(W - 2 * t, roofH, D - 2 * t),
      lib.get('roof'),
      W / 2,
      LEVELS.palaTop + roofH / 2,
      D / 2,
    ),
  )
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Room floors — so each room reads with its own finish
// ─────────────────────────────────────────────────────────────────────────────

const FLOOR_FINISH: Record<Room['kind'], SurfaceId> = {
  living: 'floorLiving',
  bed: 'floorLiving',
  bath: 'floorWet',
  kitchen: 'floorWet',
  circulation: 'floorLiving',
  utility: 'floorWet',
  garage: 'floorGarage',
}

function buildRoomFloors(level: Level, lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  const z = level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
  for (const r of ROOMS) {
    if (r.level !== level) continue
    const w = r.x1 - r.x0
    const d = r.y1 - r.y0
    const m = mesh(box(w, 0.02, d), lib.get(FLOOR_FINISH[r.kind]), r.x0 + w / 2, z + 0.011, r.y0 + d / 2)
    m.castShadow = false
    m.userData.room = r
    g.add(m)
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Stairs
// ─────────────────────────────────────────────────────────────────────────────

function buildStairs(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'stairs'
  const mat = lib.get('stair')

  const rise = (STAIR.top - STAIR.bottom) / STAIR.steps
  const runLength = STAIR.y1 - STAIR.y0 - STAIR.approach
  const going = runLength / STAIR.steps
  const cx = (STAIR.x0 + STAIR.x1) / 2

  // Climbs from the front of the stairwell towards the rear. Each tread is drawn as the solid
  // block beneath it, so the flight reads from below as well as above.
  for (let i = 0; i < STAIR.steps; i++) {
    const y = STAIR.bottom + rise * (i + 1)
    const z = STAIR.y1 - STAIR.approach - going * (i + 0.5)
    g.add(mesh(box(STAIR.width, y - STAIR.bottom, going), mat, cx, (STAIR.bottom + y) / 2, z))
  }

  // Exterior entrance: landing at the threshold, guard wall, then steps down to the terrace.
  const es = ENTRANCE_STEPS
  const exW = es.x1 - es.x0
  const exCx = (es.x0 + es.x1) / 2
  const landingDepth = es.landingTo - SIZE.depth
  g.add(
    mesh(
      box(exW, 0.25, landingDepth),
      lib.get('terrace'),
      exCx,
      es.landingZ - 0.125,
      SIZE.depth + landingDepth / 2,
    ),
  )
  // Guard walls down both sides of the landing
  for (const x of [es.x0 + 0.1, es.x1 - 0.1]) {
    const h = es.guardTop - es.landingZ
    g.add(mesh(box(0.2, h, landingDepth), lib.get('boundaryWall'), x, es.landingZ + h / 2, SIZE.depth + landingDepth / 2))
  }

  const eRise = (es.landingZ - es.from) / es.steps
  const eGoing = (es.yBottom - es.landingTo) / es.steps
  for (let i = 0; i < es.steps; i++) {
    const top = es.landingZ - eRise * i
    const z = es.landingTo + eGoing * (i + 0.5)
    g.add(mesh(box(exW, top - es.from + 0.3, eGoing), lib.get('terrace'), exCx, (top + es.from - 0.3) / 2, z))
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Site: ground surface clipped to the plot, terraces, driveway, boundaries
// ─────────────────────────────────────────────────────────────────────────────

function plotShape(): THREE.Shape {
  const s = new THREE.Shape()
  PLOT.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)))
  s.closePath()
  // Punch the footprint out. Without it the ground sheet runs through the walls and the two
  // surfaces fight along the intersection; the 0.1 m inset tucks it just under the façade.
  const k = 0.1
  const hole = new THREE.Path()
  hole.moveTo(k, k)
  hole.lineTo(SIZE.width - k, k)
  hole.lineTo(SIZE.width - k, SIZE.depth - k)
  hole.lineTo(k, SIZE.depth - k)
  hole.closePath()
  s.holes.push(hole)
  return s
}

function buildGround(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()

  // Tessellate the plot in plan, then lift every vertex to the sampled ground height.
  // ShapeGeometry gives vertices in (x, y) = plan coordinates; we re-emit them as
  // (x, height, y) so no rotation is needed and the mapping stays obvious.
  const flat = subdivide(new THREE.ShapeGeometry(plotShape(), 2), 6)
  const src = flat.attributes.position as THREE.BufferAttribute
  const out: number[] = []
  for (let i = 0; i < src.count; i += 3) {
    // Reverse the winding: remapping y→z mirrors the triangle.
    for (const j of [i + 2, i + 1, i]) {
      const px = src.getX(j)
      const py = src.getY(j)
      out.push(px, groundAt(px, py), py)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3))
  geo.computeVertexNormals()
  const surface = new THREE.Mesh(geo, lib.get('ground'))
  surface.receiveShadow = true
  g.add(surface)

  // A skirt down the boundary, so the plot reads as a block of ground rather than a decal.
  const base = Math.min(...PLOT.map(([x, y]) => groundAt(x, y))) - 2.2
  const skirt: number[] = []
  for (let i = 0; i < PLOT.length; i++) {
    const [x0, y0] = PLOT[i]
    const [x1, y1] = PLOT[(i + 1) % PLOT.length]
    const h0 = groundAt(x0, y0)
    const h1 = groundAt(x1, y1)
    skirt.push(x0, h0, y0, x0, base, y0, x1, h1, y1)
    skirt.push(x1, h1, y1, x0, base, y0, x1, base, y1)
  }
  const sgeo = new THREE.BufferGeometry()
  sgeo.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3))
  sgeo.computeVertexNormals()
  const sides = new THREE.Mesh(
    sgeo,
    new THREE.MeshStandardMaterial({ color: '#6d6152', roughness: 1, side: THREE.DoubleSide }),
  )
  sides.receiveShadow = true
  g.add(sides)
  return g
}

/** Midpoint-subdivide a triangle soup so the height sampling has something to bend. */
function subdivide(geo: THREE.BufferGeometry, times: number): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo
  for (let t = 0; t < times; t++) {
    const src = g.attributes.position as THREE.BufferAttribute
    const out: number[] = []
    for (let i = 0; i < src.count; i += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(src, i)
      const b = new THREE.Vector3().fromBufferAttribute(src, i + 1)
      const c = new THREE.Vector3().fromBufferAttribute(src, i + 2)
      const ab = a.clone().add(b).multiplyScalar(0.5)
      const bc = b.clone().add(c).multiplyScalar(0.5)
      const ca = c.clone().add(a).multiplyScalar(0.5)
      for (const tri of [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ]) {
        for (const v of tri) out.push(v.x, v.y, v.z)
      }
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.Float32BufferAttribute(out, 3))
    g = next
  }
  return g
}

function buildSite(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'site'
  g.add(buildGround(lib))

  // Paving. The ground surface already carries the terraces and the ramp, so these are thin
  // slabs laid just above it rather than volumes of their own.
  const paveMat = lib.get('terrace')
  const pave = (x0: number, y0: number, x1: number, y1: number, mat: THREE.Material) => {
    const nx = Math.max(2, Math.round((x1 - x0) / 1.2))
    const ny = Math.max(2, Math.round((y1 - y0) / 1.2))
    const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, nx, ny)
    const pos = geo.attributes.position as THREE.BufferAttribute
    const cx = x0 + (x1 - x0) / 2
    const cy = y0 + (y1 - y0) / 2
    // A −90° turn about X maps local (x, y, z) to world (x, z, −y): local y runs backwards
    // along plan y, and local z carries the height.
    for (let i = 0; i < pos.count; i++) {
      const px = cx + pos.getX(i)
      const py = cy - pos.getY(i)
      pos.setZ(i, groundAt(px, py) + 0.02)
    }
    geo.computeVertexNormals()
    const m = new THREE.Mesh(geo, mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(cx, 0, cy)
    m.receiveShadow = true
    g.add(m)
  }

  pave(-2.2, SIZE.depth, 8.0, 14.2, paveMat) // entrance terrace
  pave(-2.6, -4.4, 16.8, 0, paveMat) // rear yard
  pave(DRIVEWAY.x0, DRIVEWAY.yBottom, DRIVEWAY.x1, DRIVEWAY.yTop, lib.get('driveway'))

  // Retaining walls either side of the driveway trench, as drawn on the basement plan.
  const wallMat = lib.get('boundaryWall')
  for (const x of [DRIVEWAY.x0, DRIVEWAY.x1]) {
    const steps = 10
    for (let i = 0; i < steps; i++) {
      const ya = DRIVEWAY.yBottom + ((DRIVEWAY.yTop - DRIVEWAY.yBottom) * i) / steps
      const yb = DRIVEWAY.yBottom + ((DRIVEWAY.yTop - DRIVEWAY.yBottom) * (i + 1)) / steps
      const zFloor = Math.min(groundAt(x, ya), groundAt(x, yb))
      const zTop = groundAt(x + (x === DRIVEWAY.x0 ? -1.8 : 1.8), (ya + yb) / 2)
      const h = Math.max(0.12, zTop - zFloor)
      g.add(mesh(box(0.2, h, yb - ya), wallMat, x, zFloor + h / 2, (ya + yb) / 2))
    }
  }

  // Plot boundaries
  for (let i = 0; i < PLOT.length; i++) {
    const [x0, y0] = PLOT[i]
    const [x1, y1] = PLOT[(i + 1) % PLOT.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    const walled = BOUNDARY.walledEdges.includes(i)
    // Follow the ground rather than sitting at one level along the whole run.
    const spans = Math.max(1, Math.round(len / 3))
    for (let k = 0; k < spans; k++) {
      const ta = k / spans
      const tb = (k + 1) / spans
      const ax = x0 + (x1 - x0) * ta
      const ay = y0 + (y1 - y0) * ta
      const bx = x0 + (x1 - x0) * tb
      const by = y0 + (y1 - y0) * tb
      const cx = (ax + bx) / 2
      const cy = (ay + by) / 2
      const zc = groundAt(cx, cy)
      const spanLen = Math.hypot(bx - ax, by - ay)
      if (walled) {
        const w = mesh(
          box(BOUNDARY.wall.thickness, BOUNDARY.wall.height, spanLen + 0.05),
          wallMat,
          cx,
          zc + BOUNDARY.wall.height / 2,
          cy,
        )
        w.rotation.y = Math.atan2(x1 - x0, y1 - y0)
        g.add(w)
      } else {
        // Wire fence on timber posts.
        g.add(mesh(box(0.1, BOUNDARY.fence.height, 0.1), wallMat, ax, zc + BOUNDARY.fence.height / 2, ay))
      }
    }
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

export function buildHouse(lib: MaterialLibrary): HouseParts {
  const root = new THREE.Group()
  const cave = new THREE.Group()
  const ground = new THREE.Group()
  const glazing = new THREE.Group()
  const furniture = new THREE.Group()
  cave.name = 'cave'
  ground.name = 'ground'
  glazing.name = 'glazing'

  for (const w of CAVE_WALLS) {
    cave.add(buildWall(w, lib))
    for (const o of w.openings ?? []) {
      const gz = buildGlazing(w, o, lib)
      if (gz) glazing.add(gz)
    }
  }
  for (const w of GROUND_WALLS) {
    ground.add(buildWall(w, lib))
    for (const o of w.openings ?? []) {
      const gz = buildGlazing(w, o, lib)
      if (gz) glazing.add(gz)
    }
  }

  cave.add(buildRoomFloors('cave', lib))
  ground.add(buildRoomFloors('ground', lib))

  const slabs = buildSlabs(lib)
  cave.add(slabs.raft)
  const roof = buildRoof(lib)
  const stairs = buildStairs(lib)
  const site = buildSite(lib)

  root.add(cave, ground, slabs.overCave, slabs.overGround, roof, glazing, stairs, site, furniture)
  root.name = 'house'

  return {
    root,
    cave,
    ground,
    roof,
    slabOverCave: slabs.overCave,
    slabOverGround: slabs.overGround,
    glazing,
    site,
    stairs,
    furniture,
  }
}

/** Where the model sits, for framing the camera. */
export const HOUSE_CENTRE = new THREE.Vector3(SIZE.width / 2, LEVELS.groundFloor, SIZE.depth / 2)
