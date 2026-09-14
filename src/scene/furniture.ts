/**
 * Loose furniture — everything the architect did not draw.
 *
 * The plans carry the fitted work (counter runs, wardrobes, sanitary ware, white goods) and
 * `buildFixtures` puts it up as plain boxes. This file adds what the owner's reference renders
 * show on top of that: the joinery above the counters, the media wall, seating, beds, rugs and
 * the light fittings. Fittings are emissive surfaces and nothing else — the scene already has
 * a directional sun and an environment map, and a dozen extra real lights would cost far more
 * than they return.
 *
 * Same convention as the rest of the scene: plan (x, y) → world (x, z), elevation → world y.
 * Heights in this file are measured above the level's finished floor rather than on the
 * project datum, because that is how furniture is actually dimensioned.
 */

import * as THREE from 'three'
import { FIXTURES, LEVELS, ROOMS, type Fixture, type Level } from '../model/house'
import type { MaterialLibrary } from './materials'

/** Floor to finished ceiling — the same 2.60 m on both levels. */
const CLEAR = LEVELS.groundCeiling - LEVELS.groundFloor

type Rect = readonly [number, number, number, number]

// ─────────────────────────────────────────────────────────────────────────────
// Palette
//
// These are the furniture's own colours, taken off the reference renders, so they are declared
// here rather than added to `Scheme`: re-skinning the house should not repaint the sofa.
// ─────────────────────────────────────────────────────────────────────────────

const matt = (color: string, roughness = 0.85, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness })

/** A surface that reads as lit at 2700 K without being a light. */
const lit = (color: string, intensity: number) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 1 })

const CHARCOAL = matt('#26282c', 0.82) // matt near-black cabinetry
const INK = matt('#17181b', 0.8)
const WALNUT = matt('#6f4a2e', 0.62)
const WALNUT_DARK = matt('#4e3320', 0.6) // the shadowed back of a slatted panel
const OAK = matt('#b9925f', 0.66) // pale oak: desks, stools, boards
const QUARTZ = matt('#f1efe8', 0.28)
const BLACK_METAL = new THREE.MeshStandardMaterial({ color: '#191a1c', roughness: 0.38, metalness: 0.7 })
const BRASS = new THREE.MeshStandardMaterial({ color: '#b8873f', roughness: 0.3, metalness: 0.85 })
const COPPER = new THREE.MeshStandardMaterial({ color: '#b87a52', roughness: 0.32, metalness: 0.8 })
const CREAM = matt('#ded4c3', 0.95)
const LINEN = matt('#efe9dd', 0.96)
const OLIVE = matt('#5b6042', 0.95)
const TAUPE = matt('#8f867a', 0.9)
const WOOL = matt('#bdb2a3', 1) // the big soft rug
const JUTE = matt('#c3a97f', 1)
const GREEN_MARBLE = matt('#2d4238', 0.22)
const GREEN_JOINERY = matt('#26382f', 0.7)
const TRAVERTINE = matt('#dcc3b2', 0.72)
const PALE_STONE = matt('#e6dccc', 0.6)
const BLUSH = matt('#d9a292', 0.95)
const SCREEN = matt('#0d0e11', 0.16)
const MIRROR = new THREE.MeshStandardMaterial({ color: '#c9d3d8', roughness: 0.05, metalness: 0.95 })
const FOLIAGE = matt('#4c6b41', 0.9)
const POT = matt('#4c4a46', 0.8)
/** Warm strips, valances and cove lighting. */
const WARM = lit('#ffcb8e', 2.4)
const FLAME = lit('#ff8b33', 3.4)
/** A shade that is lit from inside without needing a bulb you can see. */
const SHADE = new THREE.MeshStandardMaterial({
  color: '#efe4d2',
  emissive: '#ffc98a',
  emissiveIntensity: 0.6,
  roughness: 1,
})
const SMOKED_GLASS = new THREE.MeshStandardMaterial({
  color: '#6b5c4d',
  roughness: 0.1,
  metalness: 0.2,
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
})

// ─────────────────────────────────────────────────────────────────────────────
// Geometry shared by the pieces that repeat
// ─────────────────────────────────────────────────────────────────────────────

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

const STOOL_SEAT = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20)
const STOOL_LEG = box(0.035, 0.63, 0.035)
const CHAIR_LEG = box(0.045, 0.44, 0.045)
const PENDANT_CAP = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12)
const PENDANT_SHADE = new THREE.SphereGeometry(0.115, 18, 12)
const PENDANT_BULB = new THREE.SphereGeometry(0.038, 10, 8)
const LAMP_BASE = new THREE.CylinderGeometry(0.045, 0.055, 0.16, 12)
const LAMP_SHADE = new THREE.CylinderGeometry(0.105, 0.125, 0.2, 16)
const LAMP_POOL = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16)
const LEAF = new THREE.SphereGeometry(0.22, 12, 9)

const UP = new THREE.Vector3(0, 1, 0)

// ─────────────────────────────────────────────────────────────────────────────
// Placement helpers — plan rectangle in, mesh out
// ─────────────────────────────────────────────────────────────────────────────

/** Stand a disc up against a wall, facing along plan y — a round mirror, a sconce lens. */
function faceY<T extends THREE.Mesh>(m: T): T {
  m.rotation.x = Math.PI / 2
  return m
}

/** Emissive fittings and glass cast nothing: a lamp that shadows itself reads wrong. */
function noShadow<T extends THREE.Mesh>(m: T): T {
  m.castShadow = false
  m.receiveShadow = false
  return m
}

interface Place {
  /** A box, given as a plan rectangle and a height band above the floor. */
  box(mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, h0: number, h1: number): THREE.Mesh
  /** The same, but for a light fitting: emissive, casting and receiving nothing. */
  glow(mat: THREE.Material, x0: number, y0: number, x1: number, y1: number, h0: number, h1: number): THREE.Mesh
  /** A ready-made geometry centred on a plan point, at a height above the floor. */
  at(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, h: number): THREE.Mesh
  /** A cylinder between two (x, y, height) points — pipes, rails, flexes, chair posts. */
  rod(mat: THREE.Material, r: number, a: [number, number, number], b: [number, number, number]): THREE.Mesh
  /** One instanced mesh for a run of identical parts: slats, flutes, table legs. */
  many(geo: THREE.BufferGeometry, mat: THREE.Material, spots: Array<[number, number, number]>): THREE.InstancedMesh
}

function placer(group: THREE.Group, floor: number): Place {
  const add = <T extends THREE.Object3D>(o: T): T => {
    group.add(o)
    return o
  }
  const solid = <T extends THREE.Mesh>(m: T): T => {
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
  const plate = (
    mat: THREE.Material,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    h0: number,
    h1: number,
  ) => {
    const m = new THREE.Mesh(box(x1 - x0, h1 - h0, y1 - y0), mat)
    m.position.set((x0 + x1) / 2, floor + (h0 + h1) / 2, (y0 + y1) / 2)
    return m
  }

  return {
    box: (mat, x0, y0, x1, y1, h0, h1) => add(solid(plate(mat, x0, y0, x1, y1, h0, h1))),
    glow: (mat, x0, y0, x1, y1, h0, h1) => add(noShadow(plate(mat, x0, y0, x1, y1, h0, h1))),
    at(geo, mat, x, y, h) {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(x, floor + h, y)
      return add(solid(m))
    },
    rod(mat, r, a, b) {
      const pa = new THREE.Vector3(a[0], floor + a[2], a[1])
      const pb = new THREE.Vector3(b[0], floor + b[2], b[1])
      const along = pb.clone().sub(pa)
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, along.length(), 10), mat)
      m.position.copy(pa).add(pb).multiplyScalar(0.5)
      m.quaternion.setFromUnitVectors(UP, along.normalize())
      return add(solid(m))
    },
    many(geo, mat, spots) {
      const m = new THREE.InstancedMesh(geo, mat, spots.length)
      const t = new THREE.Matrix4()
      spots.forEach(([x, y, h], i) => m.setMatrixAt(i, t.makeTranslation(x, floor + h, y)))
      m.instanceMatrix.needsUpdate = true
      return add(solid(m))
    },
  }
}

/** Centres for a run of slats fitted between two positions at roughly this pitch. */
function spread(from: number, to: number, pitch: number): number[] {
  const n = Math.max(1, Math.round((to - from) / pitch))
  const step = (to - from) / n
  return Array.from({ length: n }, (_, i) => from + step * (i + 0.5))
}

// ─────────────────────────────────────────────────────────────────────────────
// Where things go — read off the model rather than retyped, so a correction to the
// plan moves the furniture with it.
// ─────────────────────────────────────────────────────────────────────────────

function roomRects(level: Level, original: string, area: string, index = 0): ReadonlyArray<Rect> {
  const hits = ROOMS.filter((r) => r.level === level && r.original === original && r.area === area)
  const r = hits[index]
  if (!r) throw new Error(`no room ${original} ${area} #${index} on ${level}`)
  return r.rects
}

/** The one fitted item of this kind whose footprint covers this plan point. */
function fixtureAt(level: Level, kind: Fixture['kind'], x: number, y: number): Fixture {
  const f = FIXTURES.find(
    (k) => k.level === level && k.kind === kind && x >= k.x0 && x <= k.x1 && y >= k.y0 && y <= k.y1,
  )
  if (!f) throw new Error(`no ${kind} at ${x}, ${y} on ${level}`)
  return f
}

const SALA = roomRects('ground', 'Sala', '36.7 m²')[0]
const KITCHEN = roomRects('ground', 'Cozinha', '8.3 m²')[0]
const BATH_GREEN = roomRects('ground', 'I.s.', '6.0 m²')[0]
const BATH_PINK = roomRects('ground', 'I.s.', '5.0 m²')[0]
const BED_WEST = roomRects('ground', 'Quarto', '14.0 / 12.4 m²', 0)[0]
const BED_EAST = roomRects('ground', 'Quarto', '14.0 / 12.4 m²', 1)[0]
const SUITE = roomRects('ground', 'Quarto', '16.0 m²')
const LAUNDRY = roomRects('cave', 'Lavandaria', '8.7 m²')[0]

// ─────────────────────────────────────────────────────────────────────────────
// Pieces that repeat
// ─────────────────────────────────────────────────────────────────────────────

/** Glass-and-brass pendant on a flex. `cap` is the height of the ceiling rose's stem end. */
function pendant(p: Place, x: number, y: number, cap: number) {
  p.rod(BLACK_METAL, 0.007, [x, y, CLEAR], [x, y, cap])
  p.at(PENDANT_CAP, BRASS, x, y, cap - 0.02)
  noShadow(p.at(PENDANT_SHADE, SMOKED_GLASS, x, y, cap - 0.14))
  noShadow(p.at(PENDANT_BULB, WARM, x, y, cap - 0.14))
}

/** Bar stool, olive seat on a black frame. The back faces away from the counter (−y). */
function barStool(p: Place, x: number, y: number) {
  p.at(STOOL_SEAT, OLIVE, x, y, 0.67)
  p.box(OLIVE, x - 0.16, y - 0.21, x + 0.16, y - 0.14, 0.7, 1.06)
  p.many(STOOL_LEG, BLACK_METAL, [
    [x - 0.13, y - 0.13, 0.315],
    [x + 0.13, y - 0.13, 0.315],
    [x - 0.13, y + 0.13, 0.315],
    [x + 0.13, y + 0.13, 0.315],
  ])
  p.rod(BLACK_METAL, 0.013, [x - 0.14, y, 0.24], [x + 0.14, y, 0.24])
}

/** Upholstered dining chair. `back` is +1 or −1: which side of x the backrest stands on. */
function diningChair(p: Place, x: number, y: number, back: 1 | -1) {
  const s = 0.23
  p.box(TAUPE, x - s, y - s, x + s, y + s, 0.42, 0.48)
  const bx = x + back * (s - 0.035)
  p.box(TAUPE, bx - 0.035, y - s + 0.02, bx + 0.035, y + s - 0.02, 0.48, 0.94)
  p.many(CHAIR_LEG, BLACK_METAL, [
    [x - 0.19, y - 0.19, 0.22],
    [x + 0.19, y - 0.19, 0.22],
    [x - 0.19, y + 0.19, 0.22],
    [x + 0.19, y + 0.19, 0.22],
  ])
}

/** Bedside table with a lamp lit on it. */
function nightstand(p: Place, x: number, y: number) {
  p.box(WALNUT, x - 0.21, y - 0.21, x + 0.21, y + 0.21, 0.34, 0.4)
  p.box(CHARCOAL, x - 0.18, y - 0.18, x + 0.18, y + 0.18, 0.06, 0.34)
  p.at(LAMP_BASE, BRASS, x, y, 0.48)
  noShadow(p.at(LAMP_SHADE, SHADE, x, y, 0.66))
  noShadow(p.at(LAMP_POOL, WARM, x, y, 0.563))
}

/**
 * A potted plant, `h` tall, standing on `base` (a worktop, or the floor). Three overlapping
 * blobs read as foliage from any angle for a third of the meshes a leaf model would cost.
 */
function plant(p: Place, x: number, y: number, h: number, base = 0) {
  const pot = h * 0.26
  p.at(new THREE.CylinderGeometry(pot * 0.55, pot * 0.44, pot, 16), POT, x, y, base + pot / 2)
  // The lowest blob is sunk into the pot: sized off `h` alone they float clear of the rim.
  const blobs: Array<[number, number, number, number]> = [
    [0, 0, 0.5, 0.26],
    [-0.12, 0.07, 0.78, 0.2],
    [0.11, -0.06, 0.62, 0.18],
  ]
  for (const [dx, dy, dh, r] of blobs) {
    p.at(LEAF, FOLIAGE, x + dx * h, y + dy * h, base + h * dh).scale.setScalar((h * r) / 0.22)
  }
}

type Side = 'x0' | 'x1' | 'y0' | 'y1'

/**
 * A made bed: divan, mattress, a duvet turned back, two pillows and a throw over the foot.
 * `head` names the edge the headboard stands against; the first 0.10 m of the rectangle is
 * the headboard itself, so pass a rectangle 0.10 longer than the mattress.
 */
function makeBed(p: Place, [x0, y0, x1, y1]: Rect, head: Side) {
  const vertical = head === 'y0' || head === 'y1'
  const len = vertical ? y1 - y0 : x1 - x0

  /** A band between two distances measured from the head end. */
  const band = (a: number, b: number): Rect =>
    head === 'y0'
      ? [x0, y0 + a, x1, y0 + b]
      : head === 'y1'
        ? [x0, y1 - b, x1, y1 - a]
        : head === 'x0'
          ? [x0 + a, y0, x0 + b, y1]
          : [x1 - b, y0, x1 - a, y1]

  /** A slice across the bed's width, as a fraction of it. */
  const across = (r: Rect, f0: number, f1: number): Rect =>
    vertical
      ? [r[0] + (r[2] - r[0]) * f0, r[1], r[0] + (r[2] - r[0]) * f1, r[3]]
      : [r[0], r[1] + (r[3] - r[1]) * f0, r[2], r[1] + (r[3] - r[1]) * f1]

  const inset = (r: Rect, d: number): Rect => [r[0] + d, r[1] + d, r[2] - d, r[3] - d]
  /** Widen across the bed only, so the headboard overhangs the sides but not the wall. */
  const widen = (r: Rect, d: number): Rect =>
    vertical ? [r[0] - d, r[1], r[2] + d, r[3]] : [r[0], r[1] - d, r[2], r[3] + d]

  p.box(CHARCOAL, ...inset(band(0.1, len), 0.03), 0.08, 0.34)
  p.box(LINEN, ...band(0.1, len), 0.34, 0.6)
  p.box(CREAM, ...band(0.62, len), 0.58, 0.72)
  p.box(LINEN, ...inset(across(band(0.14, 0.5), 0.04, 0.48), 0.02), 0.6, 0.76)
  p.box(LINEN, ...inset(across(band(0.14, 0.5), 0.52, 0.96), 0.02), 0.6, 0.76)
  p.box(OLIVE, ...band(len - 0.6, len - 0.08), 0.72, 0.78)
  p.box(CREAM, ...widen(band(0, 0.1), 0.09), 0, 1.05)
}

// ─────────────────────────────────────────────────────────────────────────────
// Cozinha — 8.3 m². Dark cabinetry, walnut uppers, quartz over the peninsula.
// ─────────────────────────────────────────────────────────────────────────────

function buildKitchen(p: Place) {
  const bar = fixtureAt('ground', 'counter', 1.0, 7.5) // the peninsula, out into the Sala
  const run = fixtureAt('ground', 'counter', 1.95, 9.85) // the run under the front window wall
  const hob = fixtureAt('ground', 'hob', 1.95, 9.85)
  const larder = fixtureAt('ground', 'wardrobe', 3.3, 8.0)

  // Quartz over the peninsula, overhanging the living-room side far enough to sit at.
  const lip = 0.07
  p.box(QUARTZ, bar.x0, bar.y0 - 0.2, bar.x1 + lip, bar.y1 + lip, bar.h, bar.h + 0.04)
  // ...and a waterfall down the open end, which is the only end that shows.
  p.box(QUARTZ, bar.x1, bar.y0 - 0.14, bar.x1 + lip, bar.y1 + lip, 0, bar.h)
  // Fluted walnut to the living-room face, half-buried in the carcass.
  p.many(
    box(0.045, bar.h, 0.055),
    WALNUT,
    spread(bar.x0 + 0.05, bar.x1 - 0.05, 0.076).map((x) => [x, bar.y0 - 0.015, bar.h / 2]),
  )
  barStool(p, bar.x0 + 0.45, bar.y0 - 0.31)
  barStool(p, bar.x0 + 1.15, bar.y0 - 0.31)

  // Wall units in walnut either side of the hood, with the quartz carried up between them.
  const wall = KITCHEN[3]
  const face = wall - 0.35
  p.box(QUARTZ, run.x0, wall - 0.03, run.x1, wall, 0.9, 1.5)
  for (const [a, b] of [
    [run.x0, hob.x0],
    [hob.x1, run.x1],
  ]) {
    p.box(WALNUT, a, face, b, wall, 1.5, 2.2)
    p.glow(WARM, a + 0.02, face - 0.02, b - 0.02, face + 0.02, 1.46, 1.5) // under-cabinet valance
  }

  // Slimline black extractor over the hob, ducted up in a walnut box.
  p.box(INK, hob.x0 - 0.05, hob.y0 - 0.02, hob.x1 + 0.05, wall, 1.58, 1.66)
  p.box(WALNUT, hob.x0 + 0.1, wall - 0.3, hob.x1 - 0.1, wall, 1.66, CLEAR)

  // Three pendants on flexes over the peninsula.
  for (const x of spread(bar.x0 + 0.25, bar.x1 - 0.15, 0.45)) pendant(p, x, (bar.y0 + bar.y1) / 2 - 0.1, 1.98)

  // Oven and fridge column: a dark front hung on the larder carcass.
  const cf = larder.x0
  p.box(CHARCOAL, cf - 0.07, larder.y0, cf, larder.y1, 0, larder.h)
  for (const [h0, h1] of [
    [0.92, 1.46],
    [1.52, 2.06],
  ]) {
    p.box(SCREEN, cf - 0.09, larder.y0 + 0.09, cf - 0.07, larder.y1 - 0.09, h0, h1)
    p.rod(BLACK_METAL, 0.012, [cf - 0.1, larder.y0 + 0.09, h1 + 0.04], [cf - 0.1, larder.y1 - 0.09, h1 + 0.04])
  }

  // Worktop still life: a board against the splashback, a canister, a herb pot by the sink.
  p.box(OAK, run.x0 + 0.1, wall - 0.28, run.x0 + 0.42, wall - 0.04, 0.9, 0.925)
  p.at(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 12), INK, run.x0 - 0.3, 9.35, 1.0)
  plant(p, 0.65, 8.05, 0.5, 0.9)
}

// ─────────────────────────────────────────────────────────────────────────────
// Sala — 36.7 m². Media wall against the bedroom partition, lounge at the glazed
// end, dining nearer the kitchen. The 4.15 m rear glazing is left clear.
// ─────────────────────────────────────────────────────────────────────────────

function buildLiving(p: Place) {
  const back = SALA[2] // face of the g-p1 partition, x = 5.453
  const face = back - 0.35
  // The joinery stops short of both ends of the partition, which only runs y 0.35 → 3.95.
  const j0 = 0.5
  const j1 = 3.85
  // Recess opening, and the fireplace slot inside the band below it.
  const r0 = 1.3
  const r1 = 3.5
  const f0 = 1.55
  const f1 = 3.25

  p.box(CHARCOAL, face, j0, back, r0, 0, CLEAR)
  p.box(CHARCOAL, face, r1, back, j1, 0, CLEAR)
  p.box(CHARCOAL, face, r0, back, r1, 2.3, CLEAR)
  p.box(CHARCOAL, face, r0, back, f0, 0, 0.95)
  p.box(CHARCOAL, face, f1, back, r1, 0, 0.95)
  p.box(CHARCOAL, face, f0, back, f1, 0, 0.38)
  p.box(CHARCOAL, face, f0, back, f1, 0.64, 0.95)

  // Walnut lining to the recess, slatted, with a warm wash down it from the head.
  p.box(WALNUT_DARK, back - 0.05, r0, back, r1, 0.95, 2.3)
  p.many(
    box(0.03, 1.35, 0.055),
    WALNUT,
    spread(r0 + 0.04, r1 - 0.04, 0.078).map((y) => [back - 0.075, y, 1.625]),
  )
  p.glow(WARM, face + 0.03, r0 + 0.05, face + 0.2, r1 - 0.05, 2.27, 2.3)

  // Wall-hung TV on the walnut, and the long linear fire under it.
  p.box(INK, back - 0.13, f0 - 0.02, back - 0.1, f1 + 0.02, 1.23, 2.22)
  p.box(SCREEN, back - 0.16, f0, back - 0.13, f1, 1.25, 2.2)
  p.box(INK, face, f0, face + 0.2, f1, 0.36, 0.66)
  p.box(INK, face - 0.01, f0 + 0.05, face + 0.02, f1 - 0.05, 0.39, 0.42)
  p.glow(FLAME, face - 0.012, f0 + 0.05, face + 0.018, f1 - 0.05, 0.42, 0.56)

  // A vase on the shoulder of the joinery, left of the fire.
  plant(p, face + 0.17, r0 + 0.12, 0.42, 0.95)

  // ── L-shaped sofa, facing the media wall, wrapping round towards the kitchen ──
  p.box(CREAM, 0.58, 1.0, 1.58, 4.2, 0.05, 0.4)
  p.box(CREAM, 1.58, 3.22, 3.45, 4.2, 0.05, 0.4)
  p.box(CREAM, 0.58, 1.0, 0.9, 4.2, 0.4, 0.82) // back, long run
  p.box(CREAM, 0.9, 3.88, 3.45, 4.2, 0.4, 0.82) // back, return
  p.box(CREAM, 0.9, 1.0, 1.58, 1.22, 0.4, 0.66) // arm at the open end
  p.box(CREAM, 3.25, 3.22, 3.45, 4.2, 0.4, 0.66) // arm at the far end of the return
  for (const [a, b] of [
    [1.24, 2.11],
    [2.13, 3.0],
    [3.02, 3.86],
  ]) {
    p.box(LINEN, 0.9, a, 1.56, b, 0.4, 0.56)
  }
  for (const [a, b] of [
    [1.6, 2.42],
    [2.44, 3.24],
  ]) {
    p.box(LINEN, a, 3.24, b, 3.86, 0.4, 0.56)
  }
  // Scatter cushions: olive against cream, as the render has them.
  for (const [y, mat] of [
    [1.5, OLIVE],
    [2.5, LINEN],
    [3.5, OLIVE],
  ] as Array<[number, THREE.Material]>) {
    p.box(mat, 0.9, y - 0.21, 1.04, y + 0.21, 0.54, 0.96)
  }
  for (const [x, mat] of [
    [1.95, LINEN],
    [2.85, OLIVE],
  ] as Array<[number, THREE.Material]>) {
    p.box(mat, x - 0.21, 3.74, x + 0.21, 3.88, 0.54, 0.96)
  }
  p.box(OLIVE, 2.6, 3.1, 3.2, 3.7, 0.5, 0.58) // throw over the return

  // Round coffee table with a tray on it, between the sofa and the fire.
  p.at(new THREE.CylinderGeometry(0.48, 0.48, 0.05, 28), CHARCOAL, 2.6, 2.3, 0.375)
  p.at(new THREE.CylinderGeometry(0.28, 0.34, 0.35, 20), CHARCOAL, 2.6, 2.3, 0.175)
  p.at(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20), WALNUT, 2.6, 2.3, 0.413)
  p.at(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 12), PALE_STONE, 2.55, 2.24, 0.47)
  noShadow(p.at(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 10), WARM, 2.55, 2.24, 0.517))
  p.box(LINEN, 2.66, 2.3, 2.78, 2.5, 0.425, 0.455)

  p.box(WOOL, 1.35, 0.8, 4.9, 4.6, 0, 0.014)
  plant(p, 0.85, 0.85, 1.5)

  // ── Dining for six, set east so the way through to the kitchen stays clear ──
  p.box(WALNUT, 3.625, 5.4, 4.575, 7.2, 0.72, 0.76)
  p.many(box(0.07, 0.72, 0.07), CHARCOAL, [
    [3.72, 5.5, 0.36],
    [4.48, 5.5, 0.36],
    [3.72, 7.1, 0.36],
    [4.48, 7.1, 0.36],
  ])
  for (const y of [5.7, 6.3, 6.9]) {
    diningChair(p, 3.32, y, -1)
    diningChair(p, 4.88, y, 1)
    pendant(p, 4.1, y, 1.98)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// I.s. 6,0 m² — the green marble bathroom, ensuite to the 16 m² bedroom.
// ─────────────────────────────────────────────────────────────────────────────

function buildGreenBath(p: Place, lib: MaterialLibrary) {
  const [x0, y0, x1, y1] = BATH_GREEN
  const tray = fixtureAt('ground', 'shower', 7.3, 9.0)
  const vanity = fixtureAt('ground', 'counter', 9.2, 8.4)
  const glass = lib.get('glass')
  const trim = lib.get('frame')

  // Marble lining: the three shower walls, and the wall the mirror hangs on.
  p.box(GREEN_MARBLE, x0, y0, x0 + 0.02, y1, 0, 2.2)
  p.box(GREEN_MARBLE, x0, y0, tray.x1, y0 + 0.02, 0, 2.2)
  p.box(GREEN_MARBLE, x0, y1 - 0.02, tray.x1, y1, 0, 2.2)
  p.box(GREEN_MARBLE, tray.x1, y0, x1, y0 + 0.02, 0.8, 2.2)

  // Frameless screen across the open side of the tray: a fixed panel, then the door.
  const split = 9.2
  for (const [a, b, base] of [
    [y0, split, 0.02],
    [split, y1, 0.05],
  ]) {
    noShadow(p.box(glass, tray.x1 - 0.007, a, tray.x1 + 0.007, b, base, 2.0))
  }
  for (const y of [y0 + 0.02, split, y1 - 0.02]) {
    p.box(trim, tray.x1 - 0.014, y - 0.02, tray.x1 + 0.014, y + 0.02, 0, 2.0)
  }
  p.box(trim, tray.x1 - 0.014, y0, tray.x1 + 0.014, y1, 1.98, 2.04)
  p.rod(BLACK_METAL, 0.011, [tray.x1 - 0.08, 9.35, 1.0], [tray.x1 - 0.08, 9.35, 1.4])

  // Rain head on a riser against the end wall, clear of the door leaf.
  p.rod(BLACK_METAL, 0.019, [7.35, y1 - 0.05, 0.95], [7.35, y1 - 0.05, 2.05])
  p.rod(BLACK_METAL, 0.017, [7.35, y1 - 0.05, 2.08], [7.35, y1 - 0.36, 2.08])
  p.box(INK, 7.23, y1 - 0.48, 7.47, y1 - 0.24, 2.04, 2.07)
  p.box(BLACK_METAL, 7.29, y1 - 0.06, 7.41, y1, 1.05, 1.22)

  // Two lit niches in the back wall of the shower.
  for (const [a, b] of [
    [8.45, 9.05],
    [9.25, 9.85],
  ]) {
    p.box(GREEN_JOINERY, x0 + 0.02, a, x0 + 0.03, b, 1.05, 1.4)
    p.box(INK, x0 + 0.02, a, x0 + 0.09, a + 0.02, 1.05, 1.4)
    p.box(INK, x0 + 0.02, b - 0.02, x0 + 0.09, b, 1.05, 1.4)
    p.box(INK, x0 + 0.02, a, x0 + 0.09, b, 1.38, 1.4)
    p.box(INK, x0 + 0.02, a, x0 + 0.09, b, 1.05, 1.08)
    p.glow(WARM, x0 + 0.035, a + 0.02, x0 + 0.085, b - 0.02, 1.355, 1.375)
  }

  // Backlit mirror over the twin basins.
  p.glow(WARM, vanity.x0 - 0.02, y0 + 0.01, vanity.x1 - 0.03, y0 + 0.02, 1.01, 1.99)
  p.box(MIRROR, vanity.x0 + 0.04, y0 + 0.02, vanity.x1 - 0.09, y0 + 0.04, 1.05, 1.95)

  // A black vessel basin on its own ledge, filling the run between shower and vanity.
  p.box(CHARCOAL, tray.x1 + 0.1, y0, vanity.x0, y0 + 0.47, 0.81, 0.85)
  p.box(INK, 8.05, y0 + 0.07, 8.5, y0 + 0.41, 0.85, 0.99)
  p.rod(BLACK_METAL, 0.017, [8.275, y0 + 0.05, 0.85], [8.275, y0 + 0.05, 1.15])
  p.rod(BLACK_METAL, 0.015, [8.275, y0 + 0.05, 1.14], [8.275, y0 + 0.22, 1.14])

  // Towel on a rail, on the strip of wall north of the door.
  p.rod(trim, 0.012, [x1 - 0.02, 9.68, 1.45], [x1 - 0.02, 10.08, 1.45])
  p.box(LINEN, x1 - 0.07, 9.72, x1 - 0.02, 10.04, 0.86, 1.46)
}

// ─────────────────────────────────────────────────────────────────────────────
// I.s. 5,0 m² — pink travertine, with the bath under the flank window.
// ─────────────────────────────────────────────────────────────────────────────

function buildPinkBath(p: Place) {
  const [x0, y0, , y1] = BATH_PINK
  const tub = fixtureAt('ground', 'bath', 13.2, 5.0)
  const vanity = fixtureAt('ground', 'counter', 11.5, 5.7)

  // Travertine to the walls the bath sits in, stopping under the window reveal.
  p.box(TRAVERTINE, tub.x1 - 0.02, 4.7, tub.x1, y1, 0, 2.2)
  p.box(TRAVERTINE, tub.x1 - 0.02, y0, tub.x1, 4.7, 0, 1.0)
  p.box(TRAVERTINE, 12.3, y0, tub.x1, y0 + 0.02, 0, 2.2)

  // Fluted apron down the one side of the bath that shows.
  p.many(
    new THREE.CylinderGeometry(0.03, 0.03, tub.h, 10),
    PALE_STONE,
    spread(tub.y0 + 0.05, tub.y1 - 0.05, 0.075).map((y) => [tub.x0 - 0.008, y, tub.h / 2]),
  )
  p.box(PALE_STONE, tub.x0 - 0.02, tub.y0, tub.x0 + 0.06, tub.y1, tub.h - 0.05, tub.h)

  // Copper rain head over the far end of the bath.
  p.rod(COPPER, 0.018, [tub.x1 - 0.06, 5.6, tub.h], [tub.x1 - 0.06, 5.6, 2.05])
  p.rod(COPPER, 0.016, [tub.x1 - 0.06, 5.6, 2.08], [tub.x1 - 0.36, 5.6, 2.08])
  p.at(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 20), COPPER, tub.x1 - 0.4, 5.6, 2.05)

  // Round backlit mirror and a fluted copper sconce beside it.
  const mx = (vanity.x0 + vanity.x1) / 2
  faceY(noShadow(p.at(new THREE.CylinderGeometry(0.34, 0.34, 0.01, 32), WARM, mx, y1 - 0.015, 1.6)))
  faceY(p.at(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), MIRROR, mx, y1 - 0.03, 1.6))
  p.box(COPPER, 12.02, y1 - 0.07, 12.14, y1 - 0.01, 1.42, 1.88)
  p.glow(WARM, 12.04, y1 - 0.09, 12.12, y1 - 0.07, 1.45, 1.85)

  // Copper basin tap, a folded towel on the bath and a pink hand towel off the vanity.
  p.rod(COPPER, 0.017, [mx, y1 - 0.05, 0.85], [mx, y1 - 0.05, 1.12])
  p.rod(COPPER, 0.015, [mx, y1 - 0.05, 1.11], [mx, y1 - 0.22, 1.11])
  p.box(BLUSH, tub.x0 + 0.06, 4.8, tub.x0 + 0.42, 5.2, tub.h, tub.h + 0.07)
  p.box(BLUSH, vanity.x1, 5.5, vanity.x1 + 0.05, 5.86, 0.42, 0.84)

  // Stool and a runner, in the only clear floor the room has.
  p.at(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), OAK, 12.32, 4.35, 0.435)
  p.many(
    new THREE.CylinderGeometry(0.024, 0.02, 0.41, 8),
    OAK,
    [0, 2.09, 4.19].map((a): [number, number, number] => [
      12.32 + Math.cos(a) * 0.12,
      4.35 + Math.sin(a) * 0.12,
      0.205,
    ]),
  )
  p.box(JUTE, x0 + 0.2, 4.15, 12.65, 5.35, 0, 0.012)
}

// ─────────────────────────────────────────────────────────────────────────────
// Quartos. Each bed pushes up to the one partition it can: the wardrobes take the
// party walls and the rear façade is glazed, so the head goes on the flank.
// ─────────────────────────────────────────────────────────────────────────────

function buildBedrooms(p: Place) {
  // 14.0 m² — head against the Sala partition, foot towards the built-in wardrobe.
  const w = BED_WEST[0]
  makeBed(p, [w, 1.05, w + 2.1, 2.65], 'x0')
  nightstand(p, w + 0.25, 0.72)
  nightstand(p, w + 0.25, 2.98)
  p.box(WOOL, w + 0.65, 0.6, 8.8, 3.1, 0, 0.014)

  // 12.4 m² — head against the flank wall, which is the only blind one in the room.
  const e = BED_EAST[2]
  makeBed(p, [e - 2.1, 1.05, e, 2.65], 'x1')
  nightstand(p, e - 0.25, 0.72)
  nightstand(p, e - 0.25, 2.98)
  p.box(WOOL, 10.5, 0.6, e - 0.75, 3.1, 0, 0.014)

  // ── 16 m² suite: a full-height walnut slat wall behind the bed ──
  const [sx0, sy0, sx1] = SUITE[0]
  const wallFrom = 11.054 // where g-p7 starts; west of it the room opens into the return
  p.box(WALNUT_DARK, wallFrom, sy0, sx1, sy0 + 0.027, 0, CLEAR)
  p.many(
    box(0.05, CLEAR, 0.055),
    WALNUT,
    spread(wallFrom + 0.03, sx1 - 0.03, 0.082).map((x) => [x, sy0 + 0.054, CLEAR / 2]),
  )
  makeBed(p, [11.46, sy0 + 0.08, 13.22, sy0 + 2.18], 'y0')
  nightstand(p, 11.24, sy0 + 0.4)
  nightstand(p, 13.44, sy0 + 0.4)
  p.box(WOOL, sx0 + 1.0, 7.0, sx1 - 0.06, 9.7, 0, 0.014)
  plant(p, sx1 - 0.5, 9.72, 1.35)

  // The return is left clear. It is 1.10 m wide with the suite door opening through it, and
  // anything standing in it is either in the door swing or in the way of it.
}

// ─────────────────────────────────────────────────────────────────────────────
// Lavandaria — the white goods are already there; this is the bench to fold on and
// somewhere to hang what comes out of the dryer.
// ─────────────────────────────────────────────────────────────────────────────

function buildLaundry(p: Place, lib: MaterialLibrary) {
  const [, , lx1, ly1] = LAUNDRY
  p.box(lib.get('joinery'), 3.3, ly1 - 0.57, lx1 - 0.05, ly1, 0.86, 0.9)
  p.box(lib.get('joinery'), 3.35, ly1 - 0.52, lx1 - 0.1, ly1 - 0.05, 0.25, 0.29)
  p.many(box(0.06, 0.86, 0.06), CHARCOAL, [
    [3.4, ly1 - 0.47, 0.43],
    [lx1 - 0.15, ly1 - 0.47, 0.43],
    [3.4, ly1 - 0.1, 0.43],
    [lx1 - 0.15, ly1 - 0.1, 0.43],
  ])

  const rail = lib.get('frame')
  p.rod(rail, 0.016, [3.05, 8.35, 1.8], [4.45, 8.35, 1.8])
  p.rod(rail, 0.01, [3.15, 8.35, 1.8], [3.15, 8.35, CLEAR])
  p.rod(rail, 0.01, [4.35, 8.35, 1.8], [4.35, 8.35, CLEAR])
  p.box(JUTE, 4.7, 8.4, 5.15, 8.8, 0, 0.38)
}

// ─────────────────────────────────────────────────────────────────────────────
// Assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Loose furniture and the joinery that is not on the architect's drawings, per level. */
export function buildFurniture(lib: MaterialLibrary): { cave: THREE.Group; ground: THREE.Group } {
  const cave = new THREE.Group()
  const ground = new THREE.Group()
  cave.name = 'furniture-cave'
  ground.name = 'furniture-ground'

  const g = placer(ground, LEVELS.groundFloor)
  buildKitchen(g)
  buildLiving(g)
  buildGreenBath(g, lib)
  buildPinkBath(g)
  buildBedrooms(g)
  buildLaundry(placer(cave, LEVELS.caveFloor), lib)

  return { cave, ground }
}
