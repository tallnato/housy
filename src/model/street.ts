/**
 * The street the plot fronts onto.
 *
 * Deliberately generic, by the same rule `site.ts` sets and for the same reason: there is no
 * name, no house number, no signage, no bus stop, no north point and no map coordinate here,
 * and there never should be. What this file holds is a cross-section — verge, kerb, carriageway
 * — and two gate openings, every one of them measured out from the plot's own front boundary
 * rather than from anything on the ground. It is the road any house of this kind stands on.
 *
 * Same plan coordinates as `site.ts`, so +y points towards the street: the road runs in x and
 * the section is taken in y. The front boundary is 0.17 m out of square over its 22.5 m, which
 * is small but not nothing when the footpath has to meet it edge to edge, so everything is
 * anchored to `frontBoundaryY` and inherits the skew instead of restating it.
 *
 * The levels are not invented either. `groundAt` already carries the street: +0.469 at the
 * paving inside the boundary, +0.309 at the footpath outside it, +0.215 at the carriageway,
 * flat beyond y ≈ 21. The crown is sampled off that surface and the rest of the section is
 * derived from it, which is why a 0.12 m kerb closes to within 15 mm of the profile everywhere
 * along the frontage rather than having to be forced.
 */

import { DRIVEWAY, PLOT, groundAt } from './site'

/** The front boundary edge — `BOUNDARY.walledEdges[0]`, running right corner to left. */
const FRONT_RIGHT = PLOT[5]
const FRONT_LEFT = PLOT[0]

/** Where the plot's frontage starts and stops, for anything that ends with the boundary wall. */
export const FRONTAGE = { x0: FRONT_LEFT[0], x1: FRONT_RIGHT[0] }

/**
 * How far the made-up road runs: 17 m past the frontage at one end and 15 m at the other, and
 * no further. Not because it fades out — the scene's fog does not begin until 90 m and is not
 * full until 260, so nothing of a plausible length would dissolve — but because the sun's
 * shadow frustum is ±34 m about the house, and everything outside it reads as shadowed. This
 * fits inside it with metres to spare, and stops the way the plot itself stops.
 */
export const EXTENT = { x0: -24, x1: 38 }

/**
 * Plan y of the front boundary at a given x, extrapolated past both corners so the street can
 * be wider than the plot.
 */
export function frontBoundaryY(x: number): number {
  const [xr, yr] = FRONT_RIGHT
  const [xl, yl] = FRONT_LEFT
  return yl + ((yr - yl) * (x - xl)) / (xr - xl)
}

/**
 * The street in cross-section, as widths taken out from the boundary line. Sweeping this along
 * x is what keeps the skew consistent from the wall face to the far verge.
 */
export const SECTION = {
  /** Sett-paved verge between the boundary wall and the kerb. */
  footpath: 2.4,
  kerbWidth: 0.15,
  /** Upstand from the channel to the top of the kerb. */
  kerbHeight: 0.12,
  carriageway: 6.0,
  /** Fall each side of the crown. */
  crossFall: 0.02,
  /**
   * The far side is a stub — kerb and verge enough to close the road off. There is nothing
   * beyond it, and nothing beyond it would be about this plot.
   */
  farVerge: 2.4,
}

const kerbBack = SECTION.footpath + SECTION.kerbWidth

/** Offsets out from the boundary line to each edge of the section. */
export const OFFSET = {
  /** Back of the footpath, where the kerb starts. */
  kerbFace: SECTION.footpath,
  /** The gutter line: kerb behind, carriageway in front. */
  channel: kerbBack,
  crown: kerbBack + SECTION.carriageway / 2,
  farChannel: kerbBack + SECTION.carriageway,
  farKerb: kerbBack + SECTION.carriageway + SECTION.kerbWidth,
  outer: kerbBack + SECTION.carriageway + SECTION.kerbWidth + SECTION.farVerge,
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────

export interface Gate {
  /** Clear opening, between the inner faces of the piers. */
  x0: number
  x1: number
  note: string
}

/** What both gates are made of. Dimensions are as built, not as the wall measures them. */
export const GATE = {
  /** Leaf height above the paving. Taller than the 1.25 m wall, with taller piers again. */
  height: 1.9,
  /** Gap under the leaf. */
  clearance: 0.08,
  thickness: 0.06,
  /** Stiles either side of the slatted infill. */
  stile: 0.07,
  topRail: 0.1,
  bottomRail: 0.12,
  /** The fine horizontal pattern: 22 slats and a narrow shadow gap between them. */
  slats: 22,
  slatGap: 0.015,
  /** How far behind the boundary line the leaves hang, clear of the wall and of the piers. */
  setback: 0.2,
  /** The sliding leaf laps each pier by this much when it is shut. */
  lap: 0.06,
  /** A swinging leaf keeps this much clear of each jamb. */
  jambGap: 0.01,
  /** How far the pedestrian leaf opens, in degrees. */
  swing: 95,
  /** Rendered piers each side, stated as what stands above the paving. */
  pier: { size: 0.3, height: 2.1, coping: 0.06 },
  /** Ground rail the sliding leaf runs on. */
  rail: { width: 0.09, height: 0.05 },
}

export const GATES: Record<'vehicle' | 'pedestrian', Gate> = {
  /**
   * On the driveway axis, and exactly as wide as the deck between the trench's retaining
   * walls — anything narrower would leave the ramp aiming at a pier.
   */
  vehicle: { x0: DRIVEWAY.x0, x1: DRIVEWAY.x1, note: 'slides in +x, behind the wall' },
  /** On the entrance axis, in front of the foot of the steps at x 2.502. */
  pedestrian: { x0: 1.65, x1: 2.75, note: 'swings in, hung on its east jamb' },
}

/**
 * True where the front boundary wall has to stop: the clear opening plus the pier either side.
 * `builder.ts` consults this as it lays the wall ribbon, so the gap and the gates are stated
 * once. Only x matters — neither opening falls in the range of the left-flank wall.
 */
export function inGateOpening(x: number): boolean {
  for (const g of Object.values(GATES)) {
    if (x > g.x0 - GATE.pier.size && x < g.x1 + GATE.pier.size) return true
  }
  return false
}

/** The vehicle crossing: the kerb dishes across the gate and splays back up either side. */
export const DROPPED_KERB = {
  /** Upstand left across the crossing, so the channel still reads as a channel. */
  height: 0.025,
  /** Length over which it climbs back to a full kerb at each end. */
  splay: 0.9,
}

// ─────────────────────────────────────────────────────────────────────────────
// Levels
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Level of the crown. Taken off the site's own surface at the centre of the carriageway, where
 * the profile has already gone flat, so this is the surveyed street level carried along the
 * road by the site's cross-fall and nothing else.
 */
export function crownLevelAt(x: number): number {
  return groundAt(x, frontBoundaryY(x) + OFFSET.crown)
}

const channelLevelAt = (x: number) => crownLevelAt(x) - (SECTION.carriageway / 2) * SECTION.crossFall

/** The carriageway: the crown, falling away to each channel. */
export function roadLevelAt(x: number, y: number): number {
  const off = Math.abs(y - (frontBoundaryY(x) + OFFSET.crown))
  return crownLevelAt(x) - Math.min(off, SECTION.carriageway / 2) * SECTION.crossFall
}

/** Top of the near kerb, dished across the vehicle crossing. */
export function kerbTopAt(x: number): number {
  const g = GATES.vehicle
  const out = Math.max(g.x0 - x, 0, x - g.x1)
  const t = Math.min(1, out / DROPPED_KERB.splay)
  const up = DROPPED_KERB.height + (SECTION.kerbHeight - DROPPED_KERB.height) * t
  return channelLevelAt(x) + up
}

/** Top of the far kerb. Same section mirrored; nothing crosses on that side. */
export function farKerbTopAt(x: number): number {
  return channelLevelAt(x) + SECTION.kerbHeight
}

/**
 * The footpath. Planar in section, from the plot's own surface at the boundary to the top of
 * the kerb — which is a correction of at most 15 mm on the profile in the clear, and the whole
 * of the crossover dish at the vehicle gate. Meeting the boundary exactly is the point: the
 * ground mesh is clipped to the plot, so any daylight between the two is a hole.
 */
export function footpathLevelAt(x: number, y: number): number {
  const b = frontBoundaryY(x)
  const t = Math.min(1, Math.max(0, (y - b) / SECTION.footpath))
  return groundAt(x, b) * (1 - t) + kerbTopAt(x) * t
}

// ─────────────────────────────────────────────────────────────────────────────
// Trimmings
// ─────────────────────────────────────────────────────────────────────────────

export interface Path {
  /** The gate it serves. The strip is as wide as the opening and both its piers. */
  gate: Gate
  /** Plan y of its inner edge, where it meets paving that is already there. */
  yInner: number
  note: string
}

/**
 * Sett paving inside the boundary, carrying each gate to something already paved. Only these
 * two strips are missing: the entrance terrace stops at y 14.6 and the driveway deck at the
 * head of the ramp. The vehicle one climbs hard — the apron pad in `site.ts` ends at y 15.2 and
 * the ground behind the gate is 0.36 m above it — but that hump is the site surface's, and it
 * is better paved than left as grass under a gate.
 */
export const PATHS: Path[] = [
  { gate: GATES.pedestrian, yInner: 14.6, note: 'gate to the entrance terrace' },
  { gate: GATES.vehicle, yInner: DRIVEWAY.yTop, note: 'gate to the head of the ramp' },
]

/** Faded broken line down the crown. */
export const CENTRE_LINE = { mark: 2.0, gap: 4.0, width: 0.1 }

/**
 * Square uplighters set into the street face of the boundary wall. Emissive panels only: the
 * scene already has a sun and an environment map, and real lights here would cost far more than
 * they would show.
 */
export const UPLIGHTERS = { size: 0.13, above: 0.22, spacing: 2.6 }
