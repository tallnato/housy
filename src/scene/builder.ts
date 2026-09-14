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
  FIXTURES,
  GROUND_WALLS,
  LEVELS,
  ROOF_EDGE,
  ROOMS,
  SIZE,
  STAIR,
  type Fixture,
  type Level,
  type Opening,
  type Room,
  type Wall,
} from '../model/house'
import { BOUNDARY, DRIVEWAY, ENTRANCE, PLOT, groundAt } from '../model/site'
import { inGateOpening } from '../model/street'
import { buildStreet, type StreetParts } from './street'
import { buildExterior, type GarageDoor } from './exterior'
import { buildFurniture } from './furniture'
import { buildPlanting } from './planting'
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
  /** Windows and doors, split by level so they hide with their floor. */
  glazingCave: THREE.Group
  glazingGround: THREE.Group
  /** Just the room floor plates — what the walk camera stands on indoors. */
  floors: THREE.Object3D[]
  /** Paving and the driveway deck — what it stands on outdoors. */
  paving: THREE.Group
  /** Boundary and retaining walls — solid to the walker; the terrain itself is not. */
  siteWalls: THREE.Group
  site: THREE.Group
  stairs: THREE.Group
  /**
   * The layer taken from the reference renders rather than from the drawings: loose furniture
   * per level, the timber slats and eaves lighting outside, and the garden. Kept as separate
   * handles so the whole layer can be switched off and the drawn house left standing.
   */
  furnitureCave: THREE.Group
  furnitureGround: THREE.Group
  exterior: THREE.Group
  planting: THREE.Group
  /** The sectional garage door. Part of the house, not of the design layer — it always shows. */
  garageDoor: GarageDoor
  /** The road, the footpath and the two gates. */
  street: StreetParts
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material | THREE.Material[],
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
  mat: THREE.Material | THREE.Material[],
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

/** Which BoxGeometry face points away from the building, for this exterior wall. */
function outwardFaceIndex(wall: Wall): number {
  if (wall.run === 'x') return wall.at < SIZE.depth / 2 ? 5 : 4 // −z is the rear
  return wall.at < SIZE.width / 2 ? 1 : 0 // −x is the left flank
}

function exteriorWallMaterials(wall: Wall, lib: MaterialLibrary): THREE.Material[] {
  const inside = lib.get('interiorWall')
  const outside = lib.get('exteriorWall')
  const mats: THREE.Material[] = [inside, inside, inside, inside, inside, inside]
  mats[outwardFaceIndex(wall)] = outside
  return mats
}

function buildWall(wall: Wall, lib: MaterialLibrary): THREE.Group {
  const group = new THREE.Group()
  group.name = wall.id

  const floor = wall.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
  const ceil = wall.level === 'cave' ? LEVELS.caveCeiling : LEVELS.groundCeiling
  const base = wall.base ?? floor
  // Exterior walls run up behind the slab to the underside of the level above.
  const top = wall.top ?? (wall.exterior ? (wall.level === 'cave' ? LEVELS.groundFloor : LEVELS.roofSoffit) : ceil)

  // An exterior wall is rendered outside and plastered inside, so it needs two materials.
  // BoxGeometry groups run [+x, −x, +y, −y, +z, −z]; only the face pointing out of the
  // building gets the render, and the reveals read as painted plaster, which is how they are.
  const mat = wall.exterior ? exteriorWallMaterials(wall, lib) : lib.get('interiorWall')
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.from - b.from)

  let cursor = wall.from
  for (const o of openings) {
    // Clamp to the wall and skip anything already covered, so an opening that overruns its
    // wall (or overlaps its neighbour) degrades quietly instead of walling up the one before it.
    const from = Math.min(Math.max(o.from, cursor), wall.to)
    const to = Math.min(Math.max(o.to, from), wall.to)
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
  // The garage door is a sectional door that opens, built in `exterior.ts`; everything this
  // function knows how to make is fixed in its reveal.
  if (o.kind === 'door' || o.kind === 'opening' || o.kind === 'garage') return null
  const g = new THREE.Group()
  // Doorways and full-height glazing are things you walk through, so the walk camera skips
  // them when testing collisions — otherwise the front door is a wall.
  const floorLevel = wall.base ?? (wall.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor)
  g.userData.passable = o.kind === 'entrance' || o.sill <= floorLevel + 0.05
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
  /** Basement ceiling / ground floor structure, with the stairwell void in it. */
  overCave: THREE.Group
  /** Ground floor ceiling / roof structure. */
  overGround: THREE.Mesh
}

/**
 * The footprint minus one rectangular void, as four rectangles. Used to build a slab with a
 * stairwell opening in it without reaching for CSG.
 */
function slabPiecesAround(
  hx0: number,
  hy0: number,
  hx1: number,
  hy1: number,
): Array<[number, number, number, number]> {
  const W = SIZE.width - 0.02
  const D = SIZE.depth - 0.02
  const o = 0.01
  return [
    [o, o, W, hy0], // rear of the void
    [o, hy1, W, D], // front of the void
    [o, hy0, hx0, hy1], // left of it
    [hx1, hy0, W, hy1], // right of it
  ]
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

  // The deep transfer slab that spans the column-free garage below — with the stairwell
  // punched out of it, or the two floors would never connect.
  const gfThick = LEVELS.groundFloor - LEVELS.caveCeiling
  const overCave = new THREE.Group()
  overCave.name = 'slab-over-cave'
  for (const [x0, y0, x1, y1] of slabPiecesAround(STAIR.x0, STAIR.y0, STAIR.x1, STAIR.y1)) {
    overCave.add(
      mesh(box(x1 - x0, gfThick, y1 - y0), lib.get('ceiling'), (x0 + x1) / 2, LEVELS.caveCeiling + gfThick / 2, (y0 + y1) / 2),
    )
  }

  // The 0.15 m void between the finished ceiling and the roof soffit.
  const voidThick = LEVELS.roofSoffit - LEVELS.groundCeiling
  const overGround = mesh(box(W, voidThick, D), lib.get('ceiling'), SIZE.width / 2, LEVELS.groundCeiling + voidThick / 2, SIZE.depth / 2)

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
  g.name = `floors-${level}`
  const z = level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
  for (const r of ROOMS) {
    if (r.level !== level) continue
    for (const [x0, y0, x1, y1] of r.rects) {
      const m = mesh(
        box(x1 - x0, 0.02, y1 - y0),
        lib.get(FLOOR_FINISH[r.kind]),
        (x0 + x1) / 2,
        z + 0.011,
        (y0 + y1) / 2,
      )
      m.castShadow = false
      m.userData.room = r
      g.add(m)
    }
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

  // Dog-leg: up the east flight to the half-landing at the rear, turn, up the west flight.
  const rise = (STAIR.top - STAIR.bottom) / (STAIR.risersPerFlight * 2)
  const goings = STAIR.risersPerFlight - 1
  const going = (STAIR.flightTo - STAIR.flightFrom) / goings
  const landingZ = STAIR.bottom + rise * STAIR.risersPerFlight

  const flight = (
    x0: number,
    x1: number,
    startZ: number,
    /** true = climbing towards the rear (−y). */
    towardsRear: boolean,
  ) => {
    // A flight of nine risers has eight treads in it: the ninth riser lands you on the
    // half-landing (or, for the upper flight, on the floor above).
    for (let i = 0; i < goings; i++) {
      const top = startZ + rise * (i + 1)
      const z = towardsRear
        ? STAIR.flightTo - going * (i + 0.5)
        : STAIR.flightFrom + going * (i + 0.5)
      // Each tread is the solid block beneath it, standing on the flight's own base — so the
      // upper flight sits on the landing rather than filling the well down to the basement.
      g.add(mesh(box(x1 - x0, top - startZ, going), mat, (x0 + x1) / 2, (startZ + top) / 2, z))
    }
  }

  flight(STAIR.eastFlight.x0, STAIR.eastFlight.x1, STAIR.bottom, true)
  flight(STAIR.westFlight.x0, STAIR.westFlight.x1, landingZ, false)

  // Half-landing
  const lw = STAIR.x1 - STAIR.x0
  const ld = STAIR.landing.y1 - STAIR.landing.y0
  g.add(
    mesh(
      box(lw, landingZ - STAIR.bottom, ld),
      mat,
      (STAIR.x0 + STAIR.x1) / 2,
      (STAIR.bottom + landingZ) / 2,
      (STAIR.landing.y0 + STAIR.landing.y1) / 2,
    ),
  )

  // The entrance approach: a platform at threshold level with a flight climbing onto it from
  // the west, and a solid parapet along its outer edge.
  const e = ENTRANCE
  const paveMat = lib.get('terrace')
  const eRise = (e.platform.z - e.steps.from) / e.steps.risers
  const depth = e.platform.y1 - e.platform.y0
  const midY = (e.platform.y0 + e.platform.y1) / 2
  const treads = e.steps.risers - 1
  const eGoing = (e.steps.x1 - e.steps.x0) / treads

  // Platform
  g.add(
    mesh(
      box(e.platform.x1 - e.platform.x0, e.platform.z - e.steps.from + 0.6, depth),
      paveMat,
      (e.platform.x0 + e.platform.x1) / 2,
      (e.platform.z + e.steps.from - 0.6) / 2,
      midY,
    ),
  )

  // Treads, each the solid block beneath it
  const treadTop = (i: number) => e.steps.from + eRise * (i + 1)
  for (let i = 0; i < treads; i++) {
    const top = treadTop(i)
    g.add(
      mesh(
        box(eGoing, top - e.steps.from + 0.6, depth),
        paveMat,
        e.steps.x0 + eGoing * (i + 0.5),
        (top + e.steps.from - 0.6) / 2,
        midY,
      ),
    )
  }

  // Parapet along the outer edge, stepping with the flight, then level over the platform.
  const pMat = lib.get('boundaryWall')
  const pY = e.platform.y1 - e.parapet.thickness / 2
  for (let i = 0; i < treads; i++) {
    const top = treadTop(i) + e.parapet.height
    g.add(mesh(box(eGoing, e.parapet.height, e.parapet.thickness), pMat, e.steps.x0 + eGoing * (i + 0.5), top - e.parapet.height / 2, pY))
  }
  const pTop = e.platform.z + e.parapet.height
  g.add(
    mesh(
      box(e.platform.x1 - e.platform.x0, e.parapet.height, e.parapet.thickness),
      pMat,
      (e.platform.x0 + e.platform.x1) / 2,
      pTop - e.parapet.height / 2,
      pY,
    ),
  )
  // ...and the return round the east end, which is what the side elevation shows.
  g.add(
    mesh(
      box(e.parapet.thickness, e.parapet.height, depth - e.parapet.thickness),
      pMat,
      e.platform.x1 - e.parapet.thickness / 2,
      pTop - e.parapet.height / 2,
      midY - e.parapet.thickness / 2,
    ),
  )
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Fitted furniture and sanitary ware — footprints straight off the plans,
// heights by convention since the plans do not give them.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_SURFACE: Record<Fixture['kind'], SurfaceId> = {
  counter: 'joinery',
  wardrobe: 'joinery',
  sink: 'sanitary',
  hob: 'frame',
  wc: 'sanitary',
  basin: 'sanitary',
  bath: 'sanitary',
  shower: 'sanitary',
  appliance: 'frame',
}

function buildFixtures(lib: MaterialLibrary): { cave: THREE.Group; ground: THREE.Group } {
  const cave = new THREE.Group()
  const ground = new THREE.Group()
  cave.name = 'fixtures-cave'
  ground.name = 'fixtures-ground'

  for (const f of FIXTURES) {
    const floor = f.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
    const base = floor + (f.base ?? 0)
    const w = f.x1 - f.x0
    const d = f.y1 - f.y0
    const m = mesh(
      box(w, f.h, d),
      lib.get(FIXTURE_SURFACE[f.kind]),
      f.x0 + w / 2,
      base + f.h / 2,
      f.y0 + d / 2,
    )
    m.userData.fixture = f
    ;(f.level === 'cave' ? cave : ground).add(m)
  }
  return { cave, ground }
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
    // The surface is sampled per vertex, so the skirt has to be too — a straight chord between
    // the two corners misses it by up to a metre where the ground steps.
    const steps = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 1.0))
    for (let k = 0; k < steps; k++) {
      const ta = k / steps
      const tb = (k + 1) / steps
      const ax = x0 + (x1 - x0) * ta
      const ay = y0 + (y1 - y0) * ta
      const bx = x0 + (x1 - x0) * tb
      const by = y0 + (y1 - y0) * tb
      const ha = groundAt(ax, ay)
      const hb = groundAt(bx, by)
      skirt.push(ax, ha, ay, ax, base, ay, bx, hb, by)
      skirt.push(bx, hb, by, ax, base, ay, bx, base, by)
    }
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

interface Site {
  group: THREE.Group
  paving: THREE.Group
  walls: THREE.Group
}

function buildSite(lib: MaterialLibrary): Site {
  const g = new THREE.Group()
  g.name = 'site'
  const paving = new THREE.Group()
  const walls = new THREE.Group()
  paving.name = 'paving'
  walls.name = 'site-walls'
  g.add(buildGround(lib), paving, walls)

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
    paving.add(m)
  }

  pave(-2.2, SIZE.depth, 7.6, 14.6, paveMat) // entrance terrace
  pave(-2.6, -4.4, 16.8, 0, paveMat) // rear yard
  pave(DRIVEWAY.x0, DRIVEWAY.yBottom, DRIVEWAY.x1, DRIVEWAY.yTop, lib.get('driveway'))

  // Retaining walls either side of the driveway trench, as drawn on the basement plan.
  const wallMat = lib.get('boundaryWall')
  for (const x of [DRIVEWAY.x0 - DRIVEWAY.wallThickness / 2, DRIVEWAY.x1 + DRIVEWAY.wallThickness / 2]) {
    const steps = 10
    for (let i = 0; i < steps; i++) {
      const ya = DRIVEWAY.yBottom + ((DRIVEWAY.yTop - DRIVEWAY.yBottom) * i) / steps
      const yb = DRIVEWAY.yBottom + ((DRIVEWAY.yTop - DRIVEWAY.yBottom) * (i + 1)) / steps
      const zFloor = Math.min(groundAt(x, ya), groundAt(x, yb))
      const zTop = groundAt(x + (x < DRIVEWAY.x1 ? -1.8 : 1.8), (ya + yb) / 2)
      const h = Math.max(0.12, zTop - zFloor)
      walls.add(mesh(box(DRIVEWAY.wallThickness, h, yb - ya), wallMat, x, zFloor + h / 2, (ya + yb) / 2))
    }
  }

  // Plot boundaries. The street side and the left flank are rendered and painted walls; the
  // rear and the right flank are wire mesh on timber posts. Both follow the ground rather than
  // sitting at one level, so the wall is built as a ribbon of quads rather than stepped boxes.
  for (let i = 0; i < PLOT.length; i++) {
    const [x0, y0] = PLOT[i]
    const [x1, y1] = PLOT[(i + 1) % PLOT.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    // Walled edges are laid finely enough that the gate openings land on the pier faces: at
    // the 1.2 m spacing the ribbon is otherwise built at, a 5 m gap would be cut to the
    // nearest metre and the gate would stand in front of a wall it does not close.
    const walled = BOUNDARY.walledEdges.includes(i)
    const steps = Math.max(2, Math.round(len / (walled ? 0.2 : 1.2)))
    const height = walled ? BOUNDARY.wall.height : BOUNDARY.fence.height

    if (walled) {
      // Normal to the run, for giving the ribbon its thickness.
      const nx = (-(y1 - y0) / len) * (BOUNDARY.wall.thickness / 2)
      const ny = ((x1 - x0) / len) * (BOUNDARY.wall.thickness / 2)
      const verts: number[] = []
      const quad = (a: number[], b: number[], c: number[], d: number[]) => {
        verts.push(...a, ...b, ...c, ...a, ...c, ...d)
      }
      for (let k = 0; k < steps; k++) {
        const ta = k / steps
        const tb = (k + 1) / steps
        const ax = x0 + (x1 - x0) * ta
        const ay = y0 + (y1 - y0) * ta
        const bx = x0 + (x1 - x0) * tb
        const by = y0 + (y1 - y0) * tb
        if (inGateOpening((ax + bx) / 2)) continue
        const az = groundAt(ax, ay) - 0.15
        const bz = groundAt(bx, by) - 0.15
        // Two faces and a cap.
        quad([ax + nx, az, ay + ny], [bx + nx, bz, by + ny], [bx + nx, bz + height, by + ny], [ax + nx, az + height, ay + ny])
        quad([bx - nx, bz, by - ny], [ax - nx, az, ay - ny], [ax - nx, az + height, ay - ny], [bx - nx, bz + height, by - ny])
        quad(
          [ax + nx, az + height, ay + ny],
          [bx + nx, bz + height, by + ny],
          [bx - nx, bz + height, by - ny],
          [ax - nx, az + height, ay - ny],
        )
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
      geo.computeVertexNormals()
      const m = new THREE.Mesh(geo, wallMat)
      m.castShadow = true
      m.receiveShadow = true
      walls.add(m)
    } else {
      const posts = Math.max(2, Math.round(len / BOUNDARY.fence.postSpacing))
      for (let k = 0; k <= posts; k++) {
        const t = k / posts
        const px = x0 + (x1 - x0) * t
        const py = y0 + (y1 - y0) * t
        walls.add(mesh(box(0.1, height, 0.1), wallMat, px, groundAt(px, py) + height / 2, py))
      }
    }
  }
  return { group: g, paving, walls }
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

export function buildHouse(lib: MaterialLibrary): HouseParts {
  const root = new THREE.Group()
  const cave = new THREE.Group()
  const ground = new THREE.Group()
  const glazingCave = new THREE.Group()
  const glazingGround = new THREE.Group()
  cave.name = 'cave'
  ground.name = 'ground'
  glazingCave.name = 'glazing-cave'
  glazingGround.name = 'glazing-ground'

  for (const w of CAVE_WALLS) {
    cave.add(buildWall(w, lib))
    for (const o of w.openings ?? []) {
      const gz = buildGlazing(w, o, lib)
      if (gz) glazingCave.add(gz)
    }
  }
  for (const w of GROUND_WALLS) {
    ground.add(buildWall(w, lib))
    for (const o of w.openings ?? []) {
      const gz = buildGlazing(w, o, lib)
      if (gz) glazingGround.add(gz)
    }
  }

  const caveFloors = buildRoomFloors('cave', lib)
  const groundFloors = buildRoomFloors('ground', lib)
  cave.add(caveFloors)
  ground.add(groundFloors)
  // Referenced, not re-parented — Object3D.add() would pull them out of their own level.
  const floors = [caveFloors, groundFloors]

  // Fixtures live inside their own level's group so they hide with it.
  const fixtures = buildFixtures(lib)
  cave.add(fixtures.cave)
  ground.add(fixtures.ground)

  // Loose furniture goes inside its own level's group, so it hides with the floor as well as
  // with the design layer — visibility is hierarchical, so the two switches compose.
  const furniture = buildFurniture(lib)
  cave.add(furniture.cave)
  ground.add(furniture.ground)

  const slabs = buildSlabs(lib)
  cave.add(slabs.raft)
  const roof = buildRoof(lib)
  const stairs = buildStairs(lib)
  const site = buildSite(lib)
  const planting = buildPlanting(lib)
  site.group.add(planting)

  const street = buildStreet(lib)
  const exterior = buildExterior(lib)
  // The door hangs inside the reveal it fills, so it belongs to the basement's glazing and
  // disappears with it when you isolate the floor above.
  exterior.garage.group.userData.passable = true
  glazingCave.add(exterior.garage.group)

  root.add(cave, ground, slabs.overCave, slabs.overGround, roof, glazingCave, glazingGround, stairs, site.group)
  root.add(exterior.group, street.group)
  root.name = 'house'

  return {
    root,
    cave,
    ground,
    roof,
    slabOverCave: slabs.overCave,
    slabOverGround: slabs.overGround,
    glazingCave,
    glazingGround,
    floors,
    paving: site.paving,
    siteWalls: site.walls,
    site: site.group,
    stairs,
    furnitureCave: furniture.cave,
    furnitureGround: furniture.ground,
    exterior: exterior.group,
    planting,
    garageDoor: exterior.garage,
    street,
  }
}
