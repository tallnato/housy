/**
 * The plot and the ground around the house.
 *
 * Deliberately abstract: this file carries the *shape* of the plot and how the ground falls
 * across it, and nothing that would place it on a map. There are no geographic coordinates, no
 * street, no addresses and no neighbouring buildings here, and there never should be.
 *
 * Same plan coordinate system as `house.ts`: the house occupies x 0…14.005, y 0…10.501,
 * and +y points towards the street.
 *
 * The ground is not a heightfield lifted from a survey — it is *reconstructed* from the spot
 * levels dimensioned on the sections and elevations: a natural slope falling from the street at
 * the front down towards the rear, with the terraces and the driveway trench that the build
 * cuts out of it laid over the top.
 */

import { LEVELS, SIZE } from './house'

/**
 * The plot boundary, relative to the house's rear-left corner.
 * Roughly 707 m² — the figure the drawing schedule gives.
 */
export const PLOT: ReadonlyArray<readonly [number, number]> = [
  [-4.05, 16.43], // front-left corner, at the street
  [-7.12, -11.52], // rear-left
  [23.01, -9.2], // rear-right
  [21.48, 4.81],
  [19.71, 4.68], // small step in the right-hand boundary
  [18.42, 16.6], // front-right corner, at the street
]

/**
 * Spot levels transcribed from the drawings, with where they sit.
 * Kept as data because they are the evidence; the surface below is derived from them.
 */
export const SPOT_LEVELS = [
  { z: 0.215, note: 'street, 10.6 m in front of the house' },
  { z: 0.309, note: 'footpath outside the front boundary' },
  { z: 0.469, note: 'paving inside the front boundary' },
  { z: 0.369, note: 'front terrace' },
  { z: 1.519, note: 'entrance platform' },
  { z: 0.53, note: 'head of the garage ramp, at the gate' },
  { z: -1.71, note: 'forecourt in front of the garage door' },
  { z: -0.79, note: 'left flank, mid-depth' },
  { z: -1.02, note: 'right flank, mid-depth' },
  { z: -1.711, note: 'rear yard' },
  { z: -1.565, note: 'rear plot boundary' },
] as const

/**
 * The natural slope, before anything is cut into it, as a profile in y.
 *
 * The site falls about 2.2 m from the street to the back of the house — the elevations draw
 * that as a steady bank running past both flanks — and then flattens out across the rear
 * garden. A slight cross-fall to the right is why the street boundary reads +0.22 on the left
 * and −0.60 on the right.
 */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [-11.0, -1.565], // rear plot boundary
  [-6.0, -1.7],
  [-2.5, -1.711], // rear yard — the level the basement opens onto
  [0, -1.711], // at the rear wall of the house
  [4.7, -0.9], // halfway along the flanks (Corte 4 cuts here)
  [10.501, 0.33], // at the front wall
  [12.6, 0.369], // front terrace
  [15.4, 0.469],
  [17.0, 0.309], // footpath outside the boundary
  [21.1, 0.215], // the street
]

/** Corte 4 reads −0.79 at the left flank and −1.02 at the right: about 1.6 % across. */
const CROSS_FALL = -0.0164

/**
 * Flat platforms cut or filled into the slope. Each is an axis-aligned rectangle in plan with
 * a level, and a falloff over which it blends back into the natural ground.
 */
interface Pad {
  x0: number
  y0: number
  x1: number
  y1: number
  z: number
  falloff: number
  note: string
}

const PADS: Pad[] = [
  // Entrance terrace across the front of the house, at the foot of the steps
  { x0: 1.0, y0: 10.4, x1: 7.6, y1: 15.2, z: 0.47, falloff: 2.0, note: 'entrance terrace' },
  // Rear yard, cut down so the basement opens onto it at grade
  { x0: -4.5, y0: -6.5, x1: 18.5, y1: 0.4, z: -1.69, falloff: 2.6, note: 'rear yard' },
]

/**
 * The driveway, as revision 4 of the drawings has it.
 *
 * The vehicle gate is at the left end of the frontage. From it a ramp runs straight down the
 * left flank, between the boundary wall and the house, to a level forecourt at basement level
 * in front of the garage door — which is now in the left wall, near the rear corner. The left
 * elevation dimensions both ends: +0.53 at the gate and −1.71 on the forecourt, and draws the
 * ramp as one even fall between y 5.70 and the gate.
 *
 * In plan the deck is bounded on the left by the boundary wall and on the right by the house
 * wall alongside the house, then by a retaining wall at x 0.80 in front of it, which holds the
 * entrance path up at terrace level.
 */
export const DRIVEWAY = {
  /** The level forecourt in front of the garage door, out from the rear corner. */
  court: { y0: -0.6, y1: 5.7, z: LEVELS.caveFloor - 0.1 },
  /** The foot of the ramp, at the forecourt. */
  yBottom: 5.7,
  zBottom: LEVELS.caveFloor - 0.1,
  /** The head of the ramp, at the gate line. */
  yTop: 16.25,
  zTop: 0.5,
  /** Retaining wall between the deck and the entrance path, in front of the house. */
  frontWallX: 0.8,
  wallThickness: 0.2,
  /** How far the cut blends into the ground off the open (rear) end of the forecourt. */
  falloff: 0.45,
}

/** Plan x of the left boundary line at a given y. */
export function leftBoundaryX(y: number): number {
  const [xa, ya] = PLOT[0]
  const [xb, yb] = PLOT[1]
  return xa + ((xb - xa) * (y - ya)) / (yb - ya)
}

/** The deck's right-hand edge: the house wall alongside the house, the retaining wall in front. */
export function drivewayRightX(y: number): number {
  return y < SIZE.depth ? 0 : DRIVEWAY.frontWallX
}

/** Finished level of the driveway deck (forecourt or ramp) at a given y. */
export function drivewayLevelAt(y: number): number {
  const d = DRIVEWAY
  if (y <= d.yBottom) return d.court.z
  const t = Math.min(1, (y - d.yBottom) / (d.yTop - d.yBottom))
  return d.zBottom + (d.zTop - d.zBottom) * t
}

/** True inside the driveway deck, forecourt included. */
export function inDriveway(x: number, y: number): boolean {
  return y >= DRIVEWAY.court.y0 && y <= DRIVEWAY.yTop + 0.3 && x >= leftBoundaryX(y) - 0.3 && x <= drivewayRightX(y)
}

/**
 * The entrance approach, taken straight off the ground-floor plan.
 *
 * The flight does NOT run out from the façade — it runs *along* it. A 4.50 × 1.50 m platform
 * sits in front of the door at threshold level, and five treads of 0.300 m climb eastward onto
 * it from the terrace at its west end. Six risers of 0.175 m: 0.47 + 6 × 0.175 = 1.52, which
 * closes exactly on the platform level the sections dimension, and uses the same riser as the
 * internal staircase.
 */
export const ENTRANCE = {
  /** The level platform in front of the door. */
  platform: { x0: 4.002, x1: 7.003, y0: 10.501, y1: 12.001, z: 1.519 },
  /** The flight at its west end, climbing in +x. */
  steps: { x0: 2.502, x1: 4.002, from: 0.47, risers: 6 },
  /** Solid parapet along the outer edge and round the east end, 1.00 m above what it stands on. */
  parapet: { thickness: 0.15, height: 1.0 },
}

/**
 * Boundary walls. The drawings call for painted rendered walls to the street and the left
 * flank, and wire fencing on timber posts to the rear and the right flank.
 */
export const BOUNDARY = {
  wall: { height: 1.25, thickness: 0.2 },
  fence: { height: 1.5, postSpacing: 2.4 },
  /** Indices into PLOT: the edge running from vertex i to vertex i+1. Everything else fences. */
  walledEdges: [5, 0],
}

// ─────────────────────────────────────────────────────────────────────────────

const smoothstep = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** Distance from a point to an axis-aligned rectangle; 0 inside. */
function distToRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
  const dx = Math.max(x0 - x, 0, x - x1)
  const dy = Math.max(y0 - y, 0, y - y1)
  return Math.hypot(dx, dy)
}

function naturalGround(x: number, y: number): number {
  let z: number
  if (y <= PROFILE[0][0]) {
    z = PROFILE[0][1]
  } else if (y >= PROFILE[PROFILE.length - 1][0]) {
    z = PROFILE[PROFILE.length - 1][1]
  } else {
    z = PROFILE[PROFILE.length - 1][1]
    for (let i = 0; i < PROFILE.length - 1; i++) {
      const [ya, za] = PROFILE[i]
      const [yb, zb] = PROFILE[i + 1]
      if (y >= ya && y <= yb) {
        z = za + ((zb - za) * (y - ya)) / (yb - ya)
        break
      }
    }
  }
  return z + (x - SIZE.width / 2) * CROSS_FALL
}

/** The finished ground surface: natural slope, then every cut and fill laid over it. */
export function groundAt(x: number, y: number): number {
  let z = naturalGround(x, y)

  for (const p of PADS) {
    const d = distToRect(x, y, p.x0, p.y0, p.x1, p.y1)
    if (d > p.falloff) continue
    const w = 1 - smoothstep(0, p.falloff, d)
    z = z * (1 - w) + p.z * w
  }

  // The driveway is held by walls on both long sides, so it overrides the ground outright. Off
  // its open rear end it blends into the yard, which is at much the same level anyway.
  const d = DRIVEWAY
  // The extra 0.15 m on the right runs the deck level in under the house wall, where the ground
  // mesh tucks beneath the façade, so no sliver of the old slope shows at the foot of the wall.
  if (x >= leftBoundaryX(y) - 0.3 && x <= drivewayRightX(y) + 0.15 && y <= d.yTop + 0.3) {
    const dist = Math.max(0, d.court.y0 - y)
    if (dist <= d.falloff) {
      const w = 1 - smoothstep(0, d.falloff, dist)
      z = z * (1 - w) + drivewayLevelAt(y) * w
    }
  }

  return z
}
