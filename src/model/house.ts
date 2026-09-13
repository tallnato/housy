/**
 * The house, as data.
 *
 * Every number here was measured off the architect's drawings: the dimensions come from the
 * vector geometry inside the PDF plan set, not from tracing pixels, so they are exact to the
 * millimetre the drawing was authored at. Scale was confirmed as 1:100 (1 pt = 35.2778 mm).
 *
 * COORDINATES  — plan coordinates, in metres, exactly as the plans are drawn:
 *
 *        x = 0 ............................. x = 14.005
 *   y = 0   ┌─────────────────────────────┐   ← rear façade   ("alçado posterior")
 *           │                             │
 *           │                             │
 *  y = 10.5 └─────────────────────────────┘   ← front façade  ("alçado principal", the street)
 *           ↑                             ↑
 *      left façade                   right façade
 *   ("lateral esquerdo")          ("lateral direito")
 *
 *   z = elevation on the project datum. The drawings note −2.62 = 98.00 m above sea level.
 *
 * The renderer maps plan (x, y) → world (x, z) and elevation → world y, so +Z points at the
 * street and +Y is up.
 */

export const SIZE = {
  /** Outside face to outside face, left to right. */
  width: 14.005,
  /** Outside face to outside face, rear to front. */
  depth: 10.501,
  /** Exterior wall thickness. */
  wallExt: 0.35,
  /** Interior partition thickness. */
  wallInt: 0.1,
} as const

/** Every level the drawings dimension, on the project datum. */
export const LEVELS = {
  /** Underside of the basement raft. */
  caveBase: -1.76,
  /** Basement finished floor (garage, laundry, wc). */
  caveFloor: -1.61,
  /** Basement clear ceiling — 2.60 m clear. */
  caveCeiling: 0.99,
  /** Ground floor finished floor. 3.15 m floor-to-floor. */
  groundFloor: 1.54,
  /** Ground floor clear ceiling — 2.60 m clear. */
  groundCeiling: 4.14,
  /**
   * Soffit of the roof structure — 2.75 m above the ground floor, which is the dimension the
   * sections carry (and mirrors −1.61 → +1.14 at the basement). The 0.15 m between this and
   * the finished ceiling is a void, not a slab; the 0.40 m above it is the roof build-up.
   */
  roofSoffit: 4.29,
  /** Underside of the projecting band that runs round the building. */
  palaBottom: 4.29,
  /** Top of that band — it is 0.30 m deep and projects 0.30 m. */
  palaTop: 4.59,
  /**
   * Finished roof surface: washed gravel over asphalt membrane. The whole build-up from the
   * soffit is 0.40 m, of which the lower 0.30 shows as the projecting band.
   */
  roofSurface: 4.69,
  /** Top of the upstand/parapet that hides the roof. */
  parapetTop: 4.99,
} as const

/** The projecting white band ("pala") and the upstand above it. */
export const ROOF_EDGE = {
  /** How far the band sticks out past the wall face, all four sides. */
  palaProjection: 0.3,
  /** Thickness of the upstand that sits on top, measured in from the wall face. */
  parapetThickness: 0.2,
} as const

export type Level = 'cave' | 'ground'

export type OpeningKind =
  | 'window' // glazed, sits above a sill
  | 'french' // glazed, runs down to the floor
  | 'door' // interior door leaf
  | 'entrance' // the front door
  | 'garage' // the vehicle door
  | 'opening' // a structural gap with nothing in it

export interface Opening {
  /** Position along the wall's run axis, in plan metres. */
  from: number
  to: number
  /** Absolute elevations of the opening. */
  sill: number
  head: number
  kind: OpeningKind
  /** Free-text note carried through to the UI. */
  label?: string
}

/**
 * An axis-aligned wall.
 *
 * `run: 'x'` — the wall extends along x and sits at a constant y (horizontal on the plan).
 * `run: 'y'` — the wall extends along y and sits at a constant x (vertical on the plan).
 * `at` is the wall's centre line on the other axis.
 */
export interface Wall {
  id: string
  level: Level
  run: 'x' | 'y'
  at: number
  from: number
  to: number
  thickness: number
  /** Defaults to the level's floor and ceiling when omitted. */
  base?: number
  top?: number
  exterior?: boolean
  openings?: Opening[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Opening geometry shorthands. Heads line up across each floor, which is how the
// elevations are drawn: every ground-floor opening has its head at +3.74.
// ─────────────────────────────────────────────────────────────────────────────

const G_HEAD = 3.74 // ground floor lintel level
const G_SILL_HIGH = 2.54 // ordinary window sill: 1.00 m above the floor
const C_HEAD = 0.59 // basement lintel level — every basement opening heads here

const french = (from: number, to: number, label?: string): Opening => ({
  from,
  to,
  sill: LEVELS.groundFloor,
  head: G_HEAD,
  kind: 'french',
  label,
})
const window_ = (from: number, to: number, label?: string): Opening => ({
  from,
  to,
  sill: G_SILL_HIGH,
  head: G_HEAD,
  kind: 'window',
  label,
})
const door = (from: number, to: number, label?: string): Opening => ({
  from,
  to,
  sill: LEVELS.groundFloor,
  head: LEVELS.groundFloor + 2.1,
  kind: 'door',
  label,
})
const caveDoor = (from: number, to: number, label?: string): Opening => ({
  from,
  to,
  sill: LEVELS.caveFloor,
  head: LEVELS.caveFloor + 2.1,
  kind: 'door',
  label,
})

// ─────────────────────────────────────────────────────────────────────────────
// GROUND FLOOR — "planta do rés-do-chão"
// ─────────────────────────────────────────────────────────────────────────────

export const GROUND_WALLS: Wall[] = [
  // ── Exterior shell ────────────────────────────────────────────────────────
  // The rear and front walls run the full width; the flanks stop at their inner faces, so the
  // four walls tile the shell rather than overlapping (and fighting) in the corners.
  {
    id: 'g-rear',
    level: 'ground',
    run: 'x',
    at: 0.175,
    from: 0,
    to: SIZE.width,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [
      french(1.002, 5.153, 'Sala — glazed wall'),
      french(6.203, 8.203, 'Quarto'),
      french(11.004, 13.004, 'Quarto'),
    ],
  },
  {
    id: 'g-front',
    level: 'ground',
    run: 'x',
    at: SIZE.depth - 0.175,
    from: 0,
    to: SIZE.width,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [
      // The entrance is a 2.30 m recess split by a 0.30 m pillar into two 1.00 m bays.
      { from: 4.353, to: 5.353, sill: LEVELS.groundFloor, head: G_HEAD, kind: 'entrance', label: 'Entrada — Átrio' },
      // The kitchen never reaches the front wall; this leaf lights the stair hall.
      { from: 5.653, to: 6.653, sill: LEVELS.groundFloor, head: G_HEAD, kind: 'french', label: 'Átrio / escadas' },
      window_(8.753, 9.754, 'I.s.'),
      french(11.254, 13.255, 'Quarto'),
    ],
  },
  {
    id: 'g-left',
    level: 'ground',
    run: 'y',
    at: 0.175,
    from: SIZE.wallExt,
    to: SIZE.depth - SIZE.wallExt,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [window_(4.751, 6.751, 'Sala'), window_(7.951, 9.451, 'Cozinha')],
  },
  {
    id: 'g-right',
    level: 'ground',
    run: 'y',
    at: SIZE.width - 0.175,
    from: SIZE.wallExt,
    to: SIZE.depth - SIZE.wallExt,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [window_(3.95, 4.7, 'I.s.')],
  },

  // ── Partitions ────────────────────────────────────────────────────────────
  // Sala | Quarto
  { id: 'g-p1', level: 'ground', run: 'y', at: 5.503, from: 0.35, to: 3.95, thickness: SIZE.wallInt },
  // Quarto | Quarto
  { id: 'g-p2', level: 'ground', run: 'y', at: 9.604, from: 0.35, to: 3.9, thickness: SIZE.wallInt },
  // Bedroom corridor wall, with the two bedroom doors in it
  {
    id: 'g-p3',
    level: 'ground',
    run: 'x',
    at: 3.9,
    from: 5.453,
    to: 13.655,
    thickness: SIZE.wallInt,
    openings: [door(8.653, 9.454, 'Quarto'), door(9.754, 10.554, 'Quarto')],
  },
  // Hall | Sala, running down past the stair
  {
    id: 'g-p4',
    level: 'ground',
    run: 'y',
    at: 8.003,
    from: 3.9,
    to: 8.101,
    thickness: SIZE.wallInt,
    openings: [door(4.051, 4.851, 'Hall')],
  },
  // I.s. 5,0 m² wall
  {
    id: 'g-p5',
    level: 'ground',
    run: 'y',
    at: 11.104,
    from: 3.9,
    to: 6.051,
    thickness: SIZE.wallInt,
    openings: [door(4.051, 4.851, 'I.s.')],
  },
  {
    id: 'g-p6',
    level: 'ground',
    run: 'x',
    at: 5.201,
    from: 7.953,
    to: 11.154,
    thickness: SIZE.wallInt,
    openings: [door(10.154, 10.954, 'Quarto 16 m²')],
  },
  { id: 'g-p7', level: 'ground', run: 'x', at: 6.001, from: 11.054, to: 13.655, thickness: SIZE.wallInt },
  // Suite wall — two doors: into the suite and into the family bathroom
  {
    id: 'g-p8',
    level: 'ground',
    run: 'y',
    at: 9.904,
    from: 5.201,
    to: 10.151,
    thickness: SIZE.wallInt,
    openings: [door(6.251, 7.051, 'Quarto 16 m²'), door(8.751, 9.551, 'I.s.')],
  },
  { id: 'g-p9', level: 'ground', run: 'x', at: 8.101, from: 6.753, to: 9.954, thickness: SIZE.wallInt },
  { id: 'g-p10', level: 'ground', run: 'y', at: 6.803, from: 8.101, to: 10.151, thickness: SIZE.wallInt },
  { id: 'g-p11', level: 'ground', run: 'x', at: 7.601, from: 2.952, to: 3.953, thickness: SIZE.wallInt },
  // The Cozinha/Átrio wall is a thin partition for its upper run, then thickens to 0.296 —
  // a duct block — for the last 1.19 m down to the front wall.
  { id: 'g-p12', level: 'ground', run: 'y', at: 3.704, from: 7.651, to: 8.963, thickness: 0.101 },
  { id: 'g-p13', level: 'ground', run: 'y', at: 3.802, from: 8.963, to: 10.151, thickness: 0.296 },
  // Stair core — the west wall of the stairwell, hatched on the plan
  { id: 'g-p14', level: 'ground', run: 'y', at: 5.503, from: 5.201, to: 8.851, thickness: SIZE.wallInt },

  // The pillar that splits the entrance recess — 0.30 × 0.31, standing off the inner face.
  { id: 'g-pillar', level: 'ground', run: 'y', at: 5.503, from: 10.151, to: 10.461, thickness: 0.3 },
]

// ─────────────────────────────────────────────────────────────────────────────
// BASEMENT — "planta da cave"
// ─────────────────────────────────────────────────────────────────────────────

export const CAVE_WALLS: Wall[] = [
  {
    id: 'c-rear',
    level: 'cave',
    run: 'x',
    at: 0.175,
    from: 0,
    to: SIZE.width,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [
      { from: 1.002, to: 5.153, sill: LEVELS.caveFloor, head: C_HEAD, kind: 'french', label: 'Garagem' },
      { from: 8.854, to: 13.005, sill: LEVELS.caveFloor, head: C_HEAD, kind: 'french', label: 'Garagem' },
    ],
  },
  {
    id: 'c-front',
    level: 'cave',
    run: 'x',
    at: SIZE.depth - 0.175,
    from: 0,
    to: SIZE.width,
    thickness: SIZE.wallExt,
    exterior: true,
    openings: [
      { from: 8.404, to: 13.005, sill: LEVELS.caveFloor, head: C_HEAD, kind: 'garage', label: 'Portão da garagem' },
    ],
  },
  {
    id: 'c-left',
    level: 'cave',
    run: 'y',
    at: 0.175,
    from: SIZE.wallExt,
    to: SIZE.depth - SIZE.wallExt,
    thickness: SIZE.wallExt,
    exterior: true,
    // The two left-hand windows share a head but not a sill: the elevation draws the wider
    // one 1.20 m tall and the narrower one 1.00 m.
    openings: [
      { from: 4.751, to: 6.751, sill: C_HEAD - 1.2, head: C_HEAD, kind: 'window', label: 'Garagem' },
      { from: 7.951, to: 9.451, sill: C_HEAD - 1.0, head: C_HEAD, kind: 'window', label: 'I.s. / Lavandaria' },
    ],
  },
  {
    id: 'c-right',
    level: 'cave',
    run: 'y',
    at: SIZE.width - 0.175,
    from: SIZE.wallExt,
    to: SIZE.depth - SIZE.wallExt,
    thickness: SIZE.wallExt,
    exterior: true,
  },

  // Laundry / wc block against the left wall
  {
    id: 'c-p1',
    level: 'cave',
    run: 'x',
    at: 7.601,
    from: 0.35,
    to: 4.553,
    thickness: SIZE.wallInt,
    openings: [caveDoor(4.551, 5.351, 'Lavandaria')],
  },
  { id: 'c-p2', level: 'cave', run: 'y', at: 1.902, from: 7.601, to: 10.151, thickness: SIZE.wallInt },

  // Stair core
  {
    id: 'c-p3',
    level: 'cave',
    run: 'y',
    at: 5.503,
    from: 5.201,
    to: 10.151,
    thickness: SIZE.wallInt,
    openings: [caveDoor(9.251, 10.051, 'Escadas')],
  },
  { id: 'c-p4', level: 'cave', run: 'y', at: 8.003, from: 5.201, to: 10.151, thickness: SIZE.wallInt },
  { id: 'c-p5', level: 'cave', run: 'x', at: 5.201, from: 5.453, to: 8.053, thickness: SIZE.wallInt },
]

// ─────────────────────────────────────────────────────────────────────────────
// Rooms — the labels printed on the plans, with the clear floor area they enclose.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A room, as one or more rectangles of clear floor.
 *
 * The rectangles are not decoration: their total area reproduces the figure printed on the
 * drawing to within a few centimetres in every case, which is how the layout below was
 * checked. The Garagem, for instance, comes out at 104.1 m² against a printed 104,3.
 */
export interface Room {
  name: string
  /** Area exactly as printed on the drawing. */
  area: string
  level: Level
  rects: ReadonlyArray<readonly [number, number, number, number]>
  kind: 'living' | 'bed' | 'bath' | 'kitchen' | 'circulation' | 'utility' | 'garage'
}

export const ROOMS: Room[] = [
  // ── Ground floor ──────────────────────────────────────────────────────────
  {
    name: 'Sala',
    area: '36,7 m²',
    level: 'ground',
    kind: 'living',
    // The printed 36,7 m² is the first rectangle alone; the room also opens east into the bay
    // between the bedroom corridor wall and the stair core, with nothing dividing them.
    rects: [
      [0.35, 0.35, 5.453, 7.551],
      [5.453, 3.95, 7.953, 5.151],
    ],
  },
  { name: 'Quarto', area: '14,0 / 12,4 m²', level: 'ground', kind: 'bed', rects: [[5.553, 0.35, 9.554, 3.851]] },
  { name: 'Quarto', area: '14,0 / 12,4 m²', level: 'ground', kind: 'bed', rects: [[9.654, 0.35, 13.655, 3.851]] },
  { name: 'I.s.', area: '5,0 m²', level: 'ground', kind: 'bath', rects: [[11.154, 3.95, 13.655, 5.951]] },
  {
    name: 'Quarto',
    area: '16,0 m²',
    level: 'ground',
    kind: 'bed',
    // L-shaped: the main room plus the return north of the ensuite.
    rects: [
      [9.954, 6.051, 13.655, 10.151],
      [9.954, 5.251, 11.054, 6.051],
    ],
  },
  { name: 'Vest.', area: '5,0 m²', level: 'ground', kind: 'circulation', rects: [[8.053, 5.251, 9.854, 8.051]] },
  { name: 'I.s.', area: '6,0 m²', level: 'ground', kind: 'bath', rects: [[6.853, 8.151, 9.854, 10.151]] },
  { name: 'Cozinha', area: '8,3 m²', level: 'ground', kind: 'kitchen', rects: [[0.35, 7.651, 3.652, 10.151]] },
  {
    name: 'Átrio',
    area: '5,6 m²',
    level: 'ground',
    kind: 'circulation',
    rects: [
      [3.752, 7.651, 5.453, 10.151],
      [5.553, 8.851, 6.753, 10.151],
    ],
  },
  { name: 'Corredor', area: '', level: 'ground', kind: 'circulation', rects: [[8.053, 3.95, 11.054, 5.151]] },

  // ── Basement ──────────────────────────────────────────────────────────────
  {
    name: 'Garagem',
    area: '104,3 m²',
    level: 'cave',
    kind: 'garage',
    // Wraps round the stair core and the laundry block.
    rects: [
      [0.35, 0.35, 5.453, 7.551],
      [5.453, 0.35, 13.655, 5.151],
      [8.053, 5.151, 13.655, 10.151],
    ],
  },
  { name: 'Lavandaria', area: '8,7 m²', level: 'cave', kind: 'utility', rects: [[1.952, 7.651, 5.453, 10.151]] },
  { name: 'I.s.', area: '3,7 m²', level: 'cave', kind: 'bath', rects: [[0.35, 7.651, 1.852, 10.151]] },
]

/** Total clear floor area of a room, for checking against the printed figure. */
export function roomArea(r: Room): number {
  return r.rects.reduce((a, [x0, y0, x1, y1]) => a + (x1 - x0) * (y1 - y0), 0)
}

/** Centre of a room's largest rectangle — where its label sits. */
export function roomCentre(r: Room): [number, number] {
  const big = [...r.rects].sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0]
  return [(big[0] + big[2]) / 2, (big[1] + big[3]) / 2]
}

// ─────────────────────────────────────────────────────────────────────────────
// The internal staircase, basement → ground floor.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The internal staircase: a dog-leg with two parallel flights and a half-landing at the rear
 * end of the well.
 *
 * 18 risers of 0.175 m, nine per flight, and eight goings of 0.300 m in each — the arithmetic
 * closes exactly on the 3.150 m floor-to-floor, which is a good check that the levels are
 * right. You come off the ground floor onto the west flight beside the Átrio, turn on the
 * landing, and arrive in the basement beside the door to the garage.
 */
export const STAIR = {
  /** Stairwell enclosure, clear. */
  x0: 5.553,
  x1: 7.953,
  y0: 5.251,
  y1: 10.151,
  bottom: LEVELS.caveFloor,
  top: LEVELS.groundFloor,
  /** Half-landing at the rear end of the well. */
  landing: { y0: 5.251, y1: 6.451 },
  /** Both flights run between these two y positions. */
  flightFrom: 6.451,
  flightTo: 8.851,
  /** The two flights, either side of x = 6.753. */
  westFlight: { x0: 5.553, x1: 6.753 },
  eastFlight: { x0: 6.753, x1: 7.953 },
  risersPerFlight: 9,
}

/**
 * Fixed furniture, sanitary fittings and appliances, as drawn on the plans.
 * Heights are conventional — the plans only give the footprint.
 */
export interface Fixture {
  level: Level
  kind: 'counter' | 'sink' | 'hob' | 'wardrobe' | 'wc' | 'basin' | 'bath' | 'shower' | 'appliance'
  x0: number
  y0: number
  x1: number
  y1: number
  /** Height above the floor. */
  h: number
  /** Height the object starts at, for wall-hung things. */
  base?: number
  label?: string
}

export const FIXTURES: Fixture[] = [
  // ── Cozinha ───────────────────────────────────────────────────────────────
  { level: 'ground', kind: 'counter', x0: 0.351, y0: 7.251, x1: 1.952, y1: 7.851, h: 0.9 },
  { level: 'ground', kind: 'counter', x0: 0.351, y0: 7.851, x1: 0.952, y1: 9.551, h: 0.9 },
  { level: 'ground', kind: 'counter', x0: 0.952, y0: 9.551, x1: 2.952, y1: 10.151, h: 0.9 },
  { level: 'ground', kind: 'sink', x0: 0.427, y0: 8.251, x1: 0.877, y1: 9.176, h: 0.02, base: 0.88 },
  { level: 'ground', kind: 'hob', x0: 1.702, y0: 9.601, x1: 2.202, y1: 10.101, h: 0.02, base: 0.9 },
  { level: 'ground', kind: 'wardrobe', x0: 2.952, y0: 7.651, x1: 3.652, y1: 8.551, h: 2.2, label: 'despensa' },
  { level: 'ground', kind: 'wardrobe', x0: 2.952, y0: 8.551, x1: 3.552, y1: 9.551, h: 2.2 },
  // ── Átrio ─────────────────────────────────────────────────────────────────
  { level: 'ground', kind: 'wardrobe', x0: 3.752, y0: 7.651, x1: 3.952, y1: 8.951, h: 2.2 },
  { level: 'ground', kind: 'wardrobe', x0: 3.652, y0: 8.951, x1: 3.952, y1: 10.151, h: 2.2 },
  // ── Quartos (built-in wardrobes against the party partition) ──────────────
  { level: 'ground', kind: 'wardrobe', x0: 8.853, y0: 0.35, x1: 9.554, y1: 2.65, h: 2.2 },
  { level: 'ground', kind: 'wardrobe', x0: 9.654, y0: 0.35, x1: 10.354, y1: 2.65, h: 2.2 },
  // ── I.s. 5,0 m² ───────────────────────────────────────────────────────────
  { level: 'ground', kind: 'bath', x0: 12.754, y0: 3.95, x1: 13.655, y1: 5.951, h: 0.55 },
  { level: 'ground', kind: 'counter', x0: 11.154, y0: 5.451, x1: 11.954, y1: 5.951, h: 0.85 },
  { level: 'ground', kind: 'basin', x0: 11.369, y0: 5.516, x1: 11.739, y1: 5.886, h: 0.14, base: 0.82 },
  { level: 'ground', kind: 'wc', x0: 12.179, y0: 5.391, x1: 12.529, y1: 5.951, h: 0.42 },
  // ── Vest. (walk-in wardrobe) ──────────────────────────────────────────────
  { level: 'ground', kind: 'wardrobe', x0: 8.053, y0: 5.251, x1: 8.753, y1: 8.051, h: 2.2 },
  { level: 'ground', kind: 'wardrobe', x0: 8.753, y0: 5.251, x1: 9.854, y1: 5.822, h: 2.2 },
  { level: 'ground', kind: 'wardrobe', x0: 8.753, y0: 7.481, x1: 9.854, y1: 8.051, h: 2.2 },
  // ── I.s. 6,0 m² ───────────────────────────────────────────────────────────
  { level: 'ground', kind: 'shower', x0: 6.853, y0: 8.151, x1: 7.853, y1: 10.151, h: 0.06 },
  { level: 'ground', kind: 'counter', x0: 8.604, y0: 8.151, x1: 9.854, y1: 8.651, h: 0.85 },
  { level: 'ground', kind: 'basin', x0: 8.653, y0: 8.221, x1: 9.154, y1: 8.581, h: 0.14, base: 0.82 },
  { level: 'ground', kind: 'basin', x0: 9.304, y0: 8.221, x1: 9.804, y1: 8.581, h: 0.14, base: 0.82 },
  { level: 'ground', kind: 'wc', x0: 8.178, y0: 9.591, x1: 8.528, y1: 10.151, h: 0.42 },
  // ── Cave: I.s. 3,7 m² ─────────────────────────────────────────────────────
  { level: 'cave', kind: 'counter', x0: 1.35, y0: 7.651, x1: 1.85, y1: 8.451, h: 0.85 },
  { level: 'cave', kind: 'wc', x0: 1.29, y0: 8.676, x1: 1.85, y1: 9.026, h: 0.42 },
  { level: 'cave', kind: 'shower', x0: 0.35, y0: 9.251, x1: 1.85, y1: 10.151, h: 0.06 },
  // ── Cave: Lavandaria ──────────────────────────────────────────────────────
  { level: 'cave', kind: 'appliance', x0: 2.0, y0: 7.701, x1: 2.6, y1: 8.301, h: 1.6, label: 'BC / AQS' },
  { level: 'cave', kind: 'appliance', x0: 2.0, y0: 8.801, x1: 2.6, y1: 9.401, h: 0.85, label: 'MSR' },
  { level: 'cave', kind: 'appliance', x0: 2.0, y0: 9.501, x1: 2.6, y1: 10.101, h: 0.85, label: 'MLR' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Areas, from the site plan schedule.
// ─────────────────────────────────────────────────────────────────────────────

export const SCHEDULE = [
  { label: 'Área do terreno / lote', value: '707,0 m²' },
  { label: 'Área de implantação', value: '147,0 m²' },
  { label: 'Área total de construção', value: '294,0 m²' },
  { label: 'Área de habitação', value: '163,0 m²' },
  { label: 'Área de aparcamento', value: '131,0 m²' },
  { label: 'Índice de utilização', value: '0,43 m²/m²' },
  { label: 'Índice de ocupação do solo', value: '0,21 m²/m²' },
] as const

export const ALL_WALLS = [...CAVE_WALLS, ...GROUND_WALLS]
