/**
 * What the visualisations add on top of the drawings.
 *
 * The drawing set gives the shell; the renders show what you actually see standing in front of
 * the house — timber slat cladding, a warm LED cove tucked under the roof band, glass Juliet
 * balustrades on the full-height openings, uplighters washing the render at the base of the
 * walls, and a sectional garage door that opens. None of it is on a plan, but all of it is
 * dimensioned off one: every piece is placed from the same wall lines and levels `house.ts`
 * carries, and stands a stated distance proud of a wall face, so the cladding cannot drift off
 * the façade if the shell moves.
 *
 * Same mapping as `builder.ts`: plan (x, y) → world (x, z), elevation → world y, so +Y is up
 * and +Z points at the street.
 */

import * as THREE from 'three'
import { ALL_WALLS, LEVELS, ROOF_EDGE, SIZE, type Opening, type Wall } from '../model/house'
import { DRIVEWAY, ENTRANCE, groundAt } from '../model/site'
import type { MaterialLibrary } from './materials'

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

export type Face = 'front' | 'rear' | 'left' | 'right'

/**
 * Each façade's outside face and which way is out of the building. `runsX` says the façade
 * extends along plan x — the front and rear — so `at` is a plan y; on the flanks it is a plan x.
 */
const FACES = {
  front: { runsX: true, at: SIZE.depth, out: 1 },
  rear: { runsX: true, at: 0, out: -1 },
  left: { runsX: false, at: 0, out: -1 },
  right: { runsX: false, at: SIZE.width, out: 1 },
} as const

/**
 * A box laid flat on a façade, dimensioned the way you would describe it out loud: `from`/`to`
 * along the wall in plan metres, `base`/`top` as absolute elevations, and `proud` the distance
 * from the wall face to the box's own outer face — so a caller says how far something sticks
 * out, not where the middle of it happens to land.
 */
function onFace(
  face: Face,
  from: number,
  to: number,
  base: number,
  top: number,
  thickness: number,
  proud: number,
  mat: THREE.Material | THREE.Material[],
): THREE.Mesh {
  const f = FACES[face]
  const len = to - from
  const h = top - base
  const off = f.at + f.out * (proud - thickness / 2)
  const geo = f.runsX ? box(len, h, thickness) : box(thickness, h, len)
  const along = from + len / 2
  const y = base + h / 2
  return f.runsX ? mesh(geo, mat, along, y, off) : mesh(geo, mat, off, y, along)
}

/** Which façade an exterior wall belongs to. */
function faceOf(wall: Wall): Face {
  if (wall.run === 'x') return wall.at < SIZE.depth / 2 ? 'rear' : 'front'
  return wall.at < SIZE.width / 2 ? 'left' : 'right'
}

/** Finished ground half a metre out from the middle of a span on a façade. */
function groundOutside(face: Face, from: number, to: number): number {
  const f = FACES[face]
  const mid = (from + to) / 2
  const off = f.at + f.out * 0.5
  return f.runsX ? groundAt(mid, off) : groundAt(off, mid)
}

const EXTERIOR_WALLS = ALL_WALLS.filter((w) => w.exterior)

// ─────────────────────────────────────────────────────────────────────────────
// Vertical timber slats
// ─────────────────────────────────────────────────────────────────────────────

const TIMBER = new THREE.MeshStandardMaterial({ color: '#a2652f', roughness: 0.62, metalness: 0 })
/** The board behind the slats. Near black, so the gaps read as shadow and not as render. */
const TIMBER_BACKING = new THREE.MeshStandardMaterial({ color: '#221913', roughness: 0.95, metalness: 0 })

const SLAT = {
  width: 0.045,
  /** Centres. The 0.030 left between slats is what reads as the shadow line. */
  pitch: 0.075,
  /** Face of a slat, measured off the wall. */
  proud: 0.04,
  backing: 0.012,
  /** The backing floats off the render, so no two visible surfaces are coplanar. */
  backingGap: 0.002,
}

/** A field of vertical timber slats laid flat on one façade, standing proud of the wall face. */
export function slatPanel(face: Face, from: number, to: number, base: number, top: number): THREE.Group {
  const g = new THREE.Group()
  g.name = `slats-${face}-${from.toFixed(2)}`
  const len = to - from
  if (len <= SLAT.pitch || top - base <= 1e-4) return g

  const backFace = SLAT.backing + SLAT.backingGap
  g.add(onFace(face, from, to, base, top, SLAT.backing, backFace, TIMBER_BACKING))

  // Centre the field in the panel rather than starting hard against one edge: an off-cut slat
  // at one end is the one thing that gives a procedural batten field away.
  const n = Math.floor(len / SLAT.pitch)
  const first = from + (len - (n - 1) * SLAT.pitch) / 2
  for (let i = 0; i < n; i++) {
    // Alternate the depth by a few millimetres. A dead flat field catches the light all at once
    // and reads as a printed texture; the renders show the slats picked out one by one.
    const proud = SLAT.proud - (i % 3) * 0.003
    const at = first + i * SLAT.pitch
    // Overlap the backing slightly, so the joint never opens up at a grazing angle.
    const thickness = proud - backFace + 0.004
    g.add(onFace(face, at - SLAT.width / 2, at + SLAT.width / 2, base, top, thickness, proud, TIMBER))
  }
  return g
}

/**
 * Where the renders clad the house in timber.
 *
 * The front is the entrance bay: the pier between the door and the hall window, plus the return
 * either side of the pair, run as one double-height field from the entrance platform to the
 * band. The rear is the feature strip in the pier between the living-room glazing and the first
 * bedroom — one panel past both storeys, from the rear yard to the band, which is why it reads
 * as a seam cut through the elevation rather than as cladding on a floor.
 */
const SLAT_PANELS: Array<{ face: Face; from: number; to: number; base: number; top: number }> = [
  { face: 'front', from: 3.95, to: 4.353, base: ENTRANCE.platform.z, top: LEVELS.palaBottom },
  { face: 'front', from: 5.353, to: 5.653, base: ENTRANCE.platform.z, top: LEVELS.palaBottom },
  { face: 'front', from: 6.653, to: 7.15, base: ENTRANCE.platform.z, top: LEVELS.palaBottom },
  // −1.711 is the spot level the drawings give for the rear yard.
  { face: 'rear', from: 5.25, to: 6.2, base: -1.711, top: LEVELS.palaBottom },
]

// ─────────────────────────────────────────────────────────────────────────────
// The LED cove under the roof band, and the uplighters at the foot of the walls
// ─────────────────────────────────────────────────────────────────────────────

const LED = new THREE.MeshStandardMaterial({
  color: '#3a2a16',
  emissive: '#ffb469',
  emissiveIntensity: 1.8,
  roughness: 1,
  metalness: 0,
  // Left out of the tone mapping, so the strip still reads as a light source once ACES has
  // pulled the highlights down. It emits nothing into the scene either way — the sun and the
  // environment map do the lighting, and real lights here would cost more than they are worth.
  toneMapped: false,
})

const COVE = { setback: 0.06, depth: 0.05, height: 0.025 }

function buildCove(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'led-cove'
  const p = ROOF_EDGE.palaProjection
  const proud = p - COVE.setback
  const top = LEVELS.palaBottom - 0.002
  const base = top - COVE.height

  const strip = (face: Face, from: number, to: number, at = proud) => {
    const m = onFace(face, from, to, base, top, COVE.depth, at, LED)
    m.castShadow = false
    g.add(m)
  }

  // The band turns the corner, so the cove does too: the front and rear runs go the full length
  // of the band and the flanks fill in between them.
  const inset = COVE.setback + COVE.depth
  strip('front', -p, SIZE.width + p)
  strip('rear', -p, SIZE.width + p)
  strip('left', -(p - inset), SIZE.depth + (p - inset))
  strip('right', -(p - inset), SIZE.depth + (p - inset))

  // The entrance reads as a lit recess, with its own line of light against the wall above the
  // door; two short pieces turn the corner back out to the main run.
  // 0.10 off the wall clears the slat cladding, which stands 0.04 proud of the same face.
  const bay = { from: 3.95, to: 7.15 }
  const offWall = 0.1
  strip('front', bay.from, bay.to, offWall)
  const zWall = SIZE.depth + offWall - COVE.depth / 2
  const zMain = SIZE.depth + proud - COVE.depth / 2
  for (const x of [bay.from + COVE.depth / 2, bay.to - COVE.depth / 2]) {
    const m = mesh(box(COVE.depth, COVE.height, zMain - zWall), LED, x, base + COVE.height / 2, (zWall + zMain) / 2)
    m.castShadow = false
    g.add(m)
  }
  return g
}

const UPLIGHT = { width: 0.16, height: 0.1, depth: 0.14, proud: 0.25 }

/**
 * Spans along a façade where a fitting would be standing in a doorway rather than against a
 * wall. Derived rather than listed: anything you can walk out of, plus the entrance platform,
 * which stands against the front wall and would swallow whatever was under it.
 */
function blockedSpans(face: Face): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  for (const w of EXTERIOR_WALLS) {
    if (faceOf(w) !== face) continue
    for (const o of w.openings ?? []) {
      const walkOut =
        o.kind === 'entrance' ||
        o.kind === 'garage' ||
        (o.kind === 'french' && o.sill <= groundOutside(face, o.from, o.to) + 0.4)
      if (walkOut) spans.push([o.from - 0.2, o.to + 0.2])
    }
  }
  if (face === 'front') {
    spans.push([ENTRANCE.platform.x0 - 0.2, ENTRANCE.platform.x1 + 0.2])
    // The driveway trench and its retaining walls take the whole width in front of the garage;
    // there is no ground at the foot of the wall there to stand a fitting on.
    spans.push([DRIVEWAY.x0 - DRIVEWAY.wallThickness - 0.1, DRIVEWAY.x1 + DRIVEWAY.wallThickness + 0.1])
  }
  return spans
}

function buildUplighters(lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = 'uplighters'
  const housing = lib.get('frame')
  // BoxGeometry groups run [+x, −x, +y, −y, +z, −z]: only the top of the housing is the lamp.
  const mats = [housing, housing, LED, housing, housing, housing]

  const row = (face: Face, from: number, to: number, spacing: number) => {
    const blocked = blockedSpans(face)
    const n = Math.max(1, Math.round((to - from) / spacing))
    const step = (to - from) / n
    for (let i = 0; i < n; i++) {
      const at = from + step * (i + 0.5)
      if (blocked.some(([a, b]) => at > a && at < b)) continue
      const f = FACES[face]
      const off = f.at + f.out * (UPLIGHT.proud - UPLIGHT.depth / 2)
      const planX = f.runsX ? at : off
      const planY = f.runsX ? off : at
      const geo = f.runsX
        ? box(UPLIGHT.width, UPLIGHT.height, UPLIGHT.depth)
        : box(UPLIGHT.depth, UPLIGHT.height, UPLIGHT.width)
      // Recessed: the housing is buried and only its top shows above the finished ground.
      g.add(mesh(geo, mats, planX, groundAt(planX, planY) + 0.02 - UPLIGHT.height / 2, planY))
    }
  }

  row('front', 0.6, SIZE.width - 0.6, 2.2)
  row('rear', 0.6, SIZE.width - 0.6, 2.2)
  row('left', 0.8, SIZE.depth - 0.8, 2.6)
  row('right', 0.8, SIZE.depth - 0.8, 2.6)
  return g
}

// ─────────────────────────────────────────────────────────────────────────────
// Glass Juliet balustrades
// ─────────────────────────────────────────────────────────────────────────────

const JULIET = { height: 1.05, proud: 0.08, rail: 0.045, reveal: 0.03, glass: 0.02 }

function buildJuliet(face: Face, o: Opening, lib: MaterialLibrary): THREE.Group {
  const g = new THREE.Group()
  g.name = `juliet-${face}-${o.from.toFixed(2)}`
  const frame = lib.get('frame')
  const from = o.from + JULIET.reveal
  const to = o.to - JULIET.reveal
  const top = o.sill + JULIET.height

  const pane = onFace(face, from, to, o.sill + 0.02, top - JULIET.rail, JULIET.glass, JULIET.proud, lib.get('glass'))
  pane.castShadow = false
  g.add(pane)

  // Slim top rail, lapping the pane on both sides — the only thing holding the glass along its
  // length, which is what makes the balustrade read as frameless.
  g.add(onFace(face, from - 0.02, to + 0.02, top - JULIET.rail, top, 0.05, JULIET.proud + 0.015, frame))

  // A fixing back to each reveal.
  for (const at of [from + 0.025, to - 0.025]) {
    g.add(onFace(face, at - 0.025, at + 0.025, o.sill + 0.24, o.sill + 0.46, 0.06, JULIET.proud + 0.01, frame))
  }
  return g
}

/**
 * The openings that get one: full-height glazing with a real drop behind it. Reading it off the
 * model rather than listing it keeps the two in step, and it lands on exactly the five the
 * renders show — the three rear french doors over the yard, the hall window and the front
 * bedroom over the driveway trench. The front door excludes itself by being an `entrance`, and
 * the ordinary windows by sitting on a sill a metre up.
 */
function balustraded(): Array<{ face: Face; o: Opening }> {
  const out: Array<{ face: Face; o: Opening }> = []
  for (const w of EXTERIOR_WALLS) {
    const face = faceOf(w)
    for (const o of w.openings ?? []) {
      if (o.kind !== 'french') continue
      if (o.sill - groundOutside(face, o.from, o.to) > 0.8) out.push({ face, o })
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// The sectional garage door
// ─────────────────────────────────────────────────────────────────────────────

const GARAGE = {
  from: 8.404,
  to: 13.005,
  sill: LEVELS.caveFloor,
  head: 0.59,
  sections: 5,
  /** The leaf laps the opening by 50 mm each side, as a real door does, hiding the gap. */
  lap: 0.05,
  thickness: 0.06,
  groove: 0.03,
  /** Radius of the turn at the head. */
  radius: 0.3,
  /** Travel at fully open: enough to bring the bottom section round the turn and flat. */
  travel: 2.9,
}

/**
 * The leaf hangs just inside the reveal. That is where a sectional door actually runs, and it
 * is the only place it can: anywhere further out and the quarter circle at the head would have
 * to pass through the 0.95 m of wall standing over the opening.
 */
const LEAF_Z = SIZE.depth - SIZE.wallExt - 0.006 - GARAGE.thickness / 2

/** Where the vertical run ends — just clear of the head, so a shut door still covers it. */
const TURN_START = GARAGE.head + 0.03
const RUN_UP = TURN_START - GARAGE.sill
const TURN = (Math.PI / 2) * GARAGE.radius
/**
 * The horizontal run, under the garage ceiling at 0.99. The turn lifts the leaf 0.30 m above
 * the head, so it travels back at 0.92 with 40 mm to spare — which is the whole reason the
 * radius is small.
 */
const RUN_BACK = 2.6
const TRACK = RUN_UP + TURN + RUN_BACK
const HORIZ_Y = TURN_START + GARAGE.radius
const HORIZ_Z = LEAF_Z - GARAGE.radius

interface TrackPoint {
  y: number
  z: number
  /** 0 hanging in the opening, π/2 lying flat under the ceiling. */
  angle: number
}

/** A distance along the track, measured from the floor, as a position and an attitude. */
function trackAt(s: number): TrackPoint {
  const t = Math.min(Math.max(s, 0), TRACK)
  if (t <= RUN_UP) return { y: GARAGE.sill + t, z: LEAF_Z, angle: 0 }
  if (t <= RUN_UP + TURN) {
    const a = (t - RUN_UP) / GARAGE.radius
    return {
      y: TURN_START + Math.sin(a) * GARAGE.radius,
      z: HORIZ_Z + Math.cos(a) * GARAGE.radius,
      angle: a,
    }
  }
  return { y: HORIZ_Y, z: HORIZ_Z - (t - RUN_UP - TURN), angle: Math.PI / 2 }
}

export interface GarageDoor {
  group: THREE.Group
  /** 0 = shut, 1 = fully open. */
  setOpen(t: number): void
  readonly open: number
}

export function buildGarageDoor(lib: MaterialLibrary): GarageDoor {
  const group = new THREE.Group()
  group.name = 'garage-door'
  const leaf = new THREE.Group()
  const track = new THREE.Group()
  leaf.name = 'garage-leaf'
  track.name = 'garage-track'
  group.add(leaf, track)

  const panel = lib.get('frame')
  const width = GARAGE.to - GARAGE.from + 2 * GARAGE.lap
  const midX = (GARAGE.from + GARAGE.to) / 2
  const h = (GARAGE.head - GARAGE.sill) / GARAGE.sections

  // Each section is rigid and carries its own geometry about its centre, so following the track
  // is nothing more than a position and one rotation about x.
  const sections: THREE.Group[] = []
  for (let i = 0; i < GARAGE.sections; i++) {
    const s = new THREE.Group()
    s.name = `garage-section-${i}`
    s.add(mesh(box(width, h - GARAGE.groove, GARAGE.thickness), panel, 0, GARAGE.groove / 2, 0))
    // A set-back rib along the bottom edge: between two sections it reads as the shallow
    // horizontal groove that gives a sectional door its lines.
    s.add(mesh(box(width, GARAGE.groove, GARAGE.thickness * 0.5), panel, 0, -(h - GARAGE.groove) / 2, 0))
    sections.push(s)
    leaf.add(s)
  }

  // Rails outside each edge of the leaf, behind the piers. Sampled off the same track the
  // sections run on, so the two can never disagree about where the turn is.
  const steps = Math.ceil(TRACK / 0.22)
  const seg = TRACK / steps
  for (const x of [midX - width / 2 - 0.05, midX + width / 2 + 0.05]) {
    for (let k = 0; k < steps; k++) {
      const p = trackAt((k + 0.5) * seg)
      const m = mesh(box(0.045, seg + 0.01, 0.05), panel, x, p.y, p.z)
      m.rotation.x = -p.angle
      track.add(m)
    }
  }

  // A section is hung between its two joints, not swung about its own middle: each joint has
  // its own distance along the track — its shut position plus the common travel, stopped short
  // of the end so the leaf can never run off the rails — and the section is the chord between
  // them. That is how the real thing is hinged, and it is what keeps the corner of a section
  // from cutting into the wall over the head, or into the ceiling, as it comes round the turn.
  const stop = (i: number) => TRACK - (GARAGE.sections - i) * h
  const place = (travel: number) => {
    sections.forEach((s, i) => {
      const at = Math.min(i * h + travel, stop(i))
      const a = trackAt(at)
      const b = trackAt(at + h)
      s.position.set(midX, (a.y + b.y) / 2, (a.z + b.z) / 2)
      s.rotation.x = -Math.atan2(a.z - b.z, b.y - a.y)
    })
  }

  let open = 0
  const door: GarageDoor = {
    group,
    setOpen(t: number) {
      open = Math.min(1, Math.max(0, t))
      place(open * GARAGE.travel)
    },
    get open() {
      return open
    },
  }
  door.setOpen(0)
  return door
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

export interface ExteriorParts {
  group: THREE.Group
  garage: GarageDoor
}

export function buildExterior(lib: MaterialLibrary): ExteriorParts {
  const group = new THREE.Group()
  group.name = 'exterior'

  const slats = new THREE.Group()
  slats.name = 'timber-slats'
  for (const p of SLAT_PANELS) slats.add(slatPanel(p.face, p.from, p.to, p.base, p.top))

  const balustrades = new THREE.Group()
  balustrades.name = 'balustrades'
  for (const { face, o } of balustraded()) balustrades.add(buildJuliet(face, o, lib))

  // Nothing in here is structural, so the whole group can be switched off without leaving a
  // hole in the house.
  group.add(slats, buildCove(), balustrades, buildUplighters(lib))

  return { group, garage: buildGarageDoor(lib) }
}
