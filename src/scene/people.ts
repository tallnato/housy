/**
 * Three people to stand in the rooms.
 *
 * A 2.60 m clear ceiling, a 2.20 m door head and a 1.00 m window sill are only numbers until
 * there is a body beside them, which is the whole job of this file. So the figures are
 * dimensioned rather than sculpted: every length comes off the total height and the head count,
 * and it is the head count that makes a seven-year-old read as a child rather than a small adult.
 *
 * Same convention as the rest of the scene — plan (x, y) is world (x, z), +Y is up. Each figure
 * is built with its soles at y = 0, centred on the origin in plan and facing local −Z. That is
 * exactly where the walk camera's forward vector points for a given yaw, so `rotation.y = yaw`
 * aims a figure where the walker is looking with no offset to remember.
 */

import * as THREE from 'three'

const TAU = Math.PI * 2

// ─────────────────────────────────────────────────────────────────────────────
// Who
// ─────────────────────────────────────────────────────────────────────────────

export interface PersonSpec {
  id: 'nato' | 'cindy' | 'emi'
  name: string
  /** Total height, soles to crown, in metres. */
  height: number
  /** Eye height above the soles. */
  eyeHeight: number
  /** One line for the UI, in English — it gets translated elsewhere. */
  note: string
}

/** Eyes sit at about 93 % of standing height, near enough for a child as for an adult. */
const eyesAt = (height: number) => Math.round(height * 93) / 100

export const PEOPLE: readonly PersonSpec[] = [
  {
    id: 'nato',
    name: 'Nato',
    height: 2.0,
    eyeHeight: eyesAt(2.0),
    note: 'Tall and lean — 0.20 m of head clearance under the 2.20 m door heads.',
  },
  {
    id: 'cindy',
    name: 'Cindy',
    height: 1.58,
    eyeHeight: eyesAt(1.58),
    note: 'Eye level 1.47 m, 0.47 m above every window sill.',
  },
  {
    id: 'emi',
    name: 'Emi',
    height: 1.28,
    eyeHeight: eyesAt(1.28),
    note: 'Seven years old — her eyes clear a 1.00 m sill by 0.19 m.',
  },
]

export function personById(id: string): PersonSpec {
  const spec = PEOPLE.find((p) => p.id === id)
  if (!spec) throw new Error(`unknown person: ${id}`)
  return spec
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials. Shared by all three figures and owned by this module, which is why `dispose()`
// leaves them alone; they are deliberately outside the scheme the house is re-skinned with.
// ─────────────────────────────────────────────────────────────────────────────

const standard = (color: string, roughness: number, side: THREE.Side = THREE.FrontSide) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, side })

const SKIN = standard('#c68e69', 0.9)
// Hair and skirts are open shells — a clipped sphere and a lathe have no back face — so they
// are drawn from both sides, or the parting and the hem show through to nothing.
const HAIR = standard('#241a15', 0.7, THREE.DoubleSide)
const NAVY = standard('#3d566e', 0.85)
const CHARCOAL = standard('#333a44', 0.9)
const TERRACOTTA = standard('#a9543f', 0.85, THREE.DoubleSide)
const MOSS = standard('#5f8f78', 0.85)
const DENIM = standard('#3f5d86', 0.9, THREE.DoubleSide)
const SHOE_DARK = standard('#22242a', 0.6)
const SHOE_TAN = standard('#7a6152', 0.7)
const SHOE_PALE = standard('#e6e1d7', 0.7)

interface Outfit {
  top: THREE.MeshStandardMaterial
  /** A skirt or a dress from the waist down to `hem`; null for trousers or bare legs. */
  skirt: THREE.MeshStandardMaterial | null
  /** Hem height as a fraction of the total height. */
  hem: number
  /** Trousers over the legs; null leaves them bare. */
  legs: THREE.MeshStandardMaterial | null
  shoes: THREE.MeshStandardMaterial
  /** Sleeve length as a fraction of the upper arm; 0 is sleeveless. */
  sleeve: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Proportions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What separates the three figures. Vertical landmarks are fractions of the total height;
 * widths and thicknesses are multiples of the head, so the child comes out short-limbed and
 * big-headed from the head count alone rather than from a pile of exceptions.
 */
interface Build {
  /** Head-heights in the total height. */
  heads: number
  /** Vertical landmarks, as fractions of the total height. */
  shoulder: number
  waist: number
  /** The hip *joint* — the crotch hangs below it. */
  hip: number
  knee: number
  ankle: number
  /** Foot length, also as a fraction of the total height. */
  foot: number
  /** Shoulder and hip spans, in head-heights. */
  span: number
  hips: number
  /** Thigh radius and neck radius, in head-heights; every other limb follows the thigh. */
  thigh: number
  neck: number
  /** Arm length, against an adult's 0.175 + 0.150 + 0.088 of height. */
  arm: number
  /** Chest depth over chest width. */
  chest: number
  /** Skull width and depth, as fractions of its height. */
  skullW: number
  skullD: number
  hair: 'crop' | 'long' | 'ponytail'
  /** How far down the skull the hair reaches, in radians from the crown. */
  hairDrop: number
  outfit: Outfit
}

const BUILDS: Record<PersonSpec['id'], Build> = {
  // Tall men read at more than the canonical 7.5 heads, and that extra fifth of a head is most
  // of what makes Nato lean rather than a 7.5-head figure scaled up to 2 m. Broad across the
  // shoulders, narrow across the hips: hips are 0.63 of the shoulder span here against 0.86
  // for Cindy, which is the difference you actually see from across a room.
  nato: {
    heads: 7.7,
    shoulder: 0.805,
    waist: 0.6,
    hip: 0.52,
    knee: 0.285,
    ankle: 0.039,
    foot: 0.152,
    span: 2.0,
    hips: 1.25,
    thigh: 0.35,
    neck: 0.25,
    arm: 1.0,
    chest: 0.68,
    skullW: 0.7,
    skullD: 0.86,
    hair: 'crop',
    hairDrop: 1.8,
    outfit: { top: NAVY, skirt: null, hem: 0, legs: CHARCOAL, shoes: SHOE_DARK, sleeve: 0.42 },
  },
  cindy: {
    heads: 7.4,
    shoulder: 0.8,
    waist: 0.615,
    hip: 0.515,
    knee: 0.283,
    ankle: 0.038,
    foot: 0.148,
    span: 1.72,
    hips: 1.48,
    thigh: 0.375,
    neck: 0.21,
    arm: 0.96,
    chest: 0.66,
    skullW: 0.71,
    skullD: 0.86,
    hair: 'long',
    hairDrop: 2.0,
    outfit: { top: TERRACOTTA, skirt: TERRACOTTA, hem: 0.36, legs: null, shoes: SHOE_TAN, sleeve: 0 },
  },
  // Six heads at seven years old, so her head is within a millimetre of Cindy's in absolute
  // size while she is 30 cm shorter — which is exactly the thing that reads as "child".
  // The legs carry less of her height (0.48 against 0.52) and the arms are short with it.
  emi: {
    heads: 6.0,
    shoulder: 0.78,
    waist: 0.62,
    hip: 0.48,
    knee: 0.27,
    ankle: 0.042,
    foot: 0.15,
    span: 1.36,
    hips: 1.14,
    thigh: 0.27,
    neck: 0.19,
    arm: 0.9,
    chest: 0.72,
    skullW: 0.74,
    skullD: 0.9,
    hair: 'ponytail',
    hairDrop: 2.0,
    outfit: { top: MOSS, skirt: DENIM, hem: 0.4, legs: null, shoes: SHOE_PALE, sleeve: 0.4 },
  },
}

/** Every length the geometry needs, in metres. Worked out once, in the constructor. */
interface Dims {
  head: number
  chin: number
  shoulder: number
  shoulderJoint: number
  waist: number
  crotch: number
  hip: number
  knee: number
  ankle: number
  span: number
  hipSpan: number
  chestWidth: number
  chestDepth: number
  neckR: number
  armX: number
  legX: number
  thighR: number
  shinR: number
  upperArmR: number
  foreArmR: number
  upperArm: number
  foreArm: number
  hand: number
  footLen: number
  stride: number
  cruise: number
}

function measure(height: number, b: Build): Dims {
  const head = height / b.heads
  const span = head * b.span
  const thighR = head * b.thigh
  const upperArmR = thighR * 0.56
  const hip = height * b.hip
  const chestWidth = span * 0.72
  return {
    head,
    chin: height - head,
    shoulder: height * b.shoulder,
    // The joint is a little under the top of the shoulder, or the arm hangs off the collarbone.
    shoulderJoint: height * b.shoulder - head * 0.16,
    waist: height * b.waist,
    // The crotch sits below the femoral heads the legs actually pivot about.
    crotch: hip * 0.9,
    hip,
    knee: height * b.knee,
    ankle: height * b.ankle,
    span,
    hipSpan: head * b.hips,
    chestWidth,
    chestDepth: chestWidth * b.chest,
    neckR: head * b.neck,
    // Arms hang just outside the ribs, with the deltoid over the joint: the widest part of a
    // standing figure is across the arms, not across the shoulder span itself.
    armX: span / 2 - upperArmR * 0.6,
    // Femoral heads sit well inboard of the trochanters, which is why people walk with their
    // feet close to one line rather than a hip's width apart.
    legX: head * b.hips * 0.27,
    thighR,
    shinR: thighR * 0.68,
    upperArmR,
    foreArmR: thighR * 0.46,
    upperArm: height * 0.175 * b.arm,
    foreArm: height * 0.15 * b.arm,
    hand: height * 0.088 * b.arm,
    footLen: height * b.foot,
    // A full cycle covers about 1.55 leg lengths; the cruise is the pace it reads best at, and
    // both scale with the leg, so the child takes shorter, quicker steps without being told to.
    stride: hip * 1.55,
    cruise: hip * 1.5,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The walk
// ─────────────────────────────────────────────────────────────────────────────

const HIP_SWING = 0.42
const KNEE_STAND = 0.05
const KNEE_FLEX = 0.95
const ARM_SWING = 0.34
const ELBOW_STAND = 0.17
const ELBOW_FLEX = 0.45
const ARM_SPREAD = 0.07
const TORSO_TWIST = 0.1
const TORSO_LEAN = 0.05

/** +1 is the figure's right — +x, since it faces −z. */
type Side = 1 | -1

const SIDES: readonly Side[] = [1, -1]

interface Limb {
  kind: 'leg' | 'arm'
  side: Side
  /** Hip or shoulder: rotating this swings the whole limb. */
  root: THREE.Group
  /** Knee or elbow. */
  joint: THREE.Group
  /** Ankle, on the legs only. */
  foot: THREE.Group | null
}

/** A capsule of the given end-to-end length, hanging from the origin. */
function capsule(radius: number, length: number): THREE.BufferGeometry {
  // CapsuleGeometry's `height` is the cylinder between the caps, not the overall length.
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.005, length - 2 * radius), 3, 10)
  geo.translate(0, -length / 2, 0)
  return geo
}

export class Person {
  readonly spec: PersonSpec
  /** Soles at y = 0, facing local −Z. */
  readonly group = new THREE.Group()

  private readonly dims: Dims
  private readonly geometries = new Set<THREE.BufferGeometry>()
  private readonly limbs: Limb[] = []
  /** Carries the vertical bob, so the caller's own transform on `group` survives it. */
  private readonly bob = new THREE.Group()
  /** Everything above the waist: it counter-rotates against the legs, which the pelvis cannot. */
  private readonly torso = new THREE.Group()
  private readonly head = new THREE.Group()
  private phase = 0
  private swing = 0

  constructor(spec: PersonSpec) {
    this.spec = spec
    const build = BUILDS[spec.id]
    this.dims = measure(spec.height, build)

    this.group.name = spec.id
    this.group.add(this.bob)
    this.bob.add(this.torso)
    this.torso.position.y = this.dims.waist
    this.torso.add(this.head)
    this.head.position.y = this.dims.chin - this.dims.waist

    this.buildTorso(build)
    this.buildHead(build)
    for (const side of SIDES) {
      this.buildLeg(build, side)
      this.buildArm(build, side)
    }
    this.pose()
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    this.geometries.add(geo)
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }

  private sphere(radius: number): THREE.BufferGeometry {
    const geo = new THREE.SphereGeometry(radius, 14, 10)
    this.geometries.add(geo)
    return geo
  }

  /** An oval capsule spanning y0…y1, in a parent whose origin sits at `origin`. */
  private trunk(mat: THREE.Material, y0: number, y1: number, width: number, depth: number, origin: number) {
    const m = this.mesh(capsule(depth / 2, y1 - y0), mat)
    m.position.y = y1 - origin
    // Torsos are wider than they are deep and a capsule is round, so stretch it across.
    m.scale.x = width / depth
    return m
  }

  private buildTorso(b: Build) {
    const d = this.dims
    const o = b.outfit

    // Pelvis and chest overlap through the waist: butted end to end, two round caps pinch.
    const pelvis = o.skirt ?? o.legs ?? SKIN
    this.bob.add(this.trunk(pelvis, d.crotch, d.waist + 0.04, d.hipSpan, d.hipSpan * 0.72, 0))
    const chestTop = d.shoulder + d.chestDepth * 0.12
    this.torso.add(this.trunk(o.top, d.waist - 0.06, chestTop, d.chestWidth, d.chestDepth, d.waist))

    // Deltoids, which is what actually gives a shoulder its width at this resolution.
    for (const side of SIDES) {
      const r = d.upperArmR * 1.3
      const cap = this.mesh(this.sphere(r), o.sleeve > 0 ? o.top : SKIN)
      cap.position.set(side * (d.span / 2 - r * 0.55), d.shoulder - d.head * 0.13 - d.waist, 0)
      cap.scale.set(1, 0.95, 1.05)
      this.torso.add(cap)
    }

    const neckBottom = d.shoulder - d.head * 0.12
    const neckTop = d.chin + 0.015
    const neckGeo = new THREE.CylinderGeometry(d.neckR, d.neckR * 1.2, neckTop - neckBottom, 10)
    const neck = this.mesh(neckGeo, SKIN)
    neck.position.y = (neckBottom + neckTop) / 2 - d.waist
    this.torso.add(neck)

    if (o.skirt) {
      const hem = this.spec.height * o.hem
      const w = d.hipSpan / 2
      const at = (y: number) => y - d.waist
      // Bottom upwards: LatheGeometry takes its normals from the profile direction, and the
      // other way round the skirt lights as if it were inside out.
      const profile = [
        new THREE.Vector2(w * 1.34, at(hem)),
        new THREE.Vector2(w * 1.22, at(hem + (d.crotch - hem) * 0.45)),
        new THREE.Vector2(w * 1.1, at(d.crotch)),
        new THREE.Vector2(w * 1.02, at(d.crotch + (d.waist - d.crotch) * 0.35)),
        new THREE.Vector2(w * 0.86, at(d.waist + 0.02)),
      ]
      const skirt = this.mesh(new THREE.LatheGeometry(profile, 16), o.skirt)
      skirt.scale.z = 0.82
      this.torso.add(skirt)
    }
  }

  private buildHead(b: Build) {
    const d = this.dims
    const r = d.head / 2

    // One oval for the whole head: skull, the hair over it and the fall behind it all take the
    // same squash, so they stay concentric however the proportions change.
    const shape = new THREE.Group()
    shape.scale.set(b.skullW, 1, b.skullD)
    this.head.add(shape)

    const skull = this.mesh(this.sphere(r), SKIN)
    skull.position.y = r
    shape.add(skull)

    // Hair is a clipped sphere with a gap left where the face is. Note the two conventions:
    // three.js measures a sphere's azimuth from −x and a lathe's from +z, so the same gap in
    // front starts at a different angle on each.
    const face = b.hair === 'crop' ? 1.15 : 0.95
    const covered = TAU - face
    const cap = this.mesh(
      new THREE.SphereGeometry(r * 1.045, 16, 10, Math.PI / 2 - covered / 2, covered, 0, b.hairDrop),
      HAIR,
    )
    cap.position.y = r * 1.02
    shape.add(cap)

    if (b.hair === 'long') {
      // A curtain from the widest part of the skull down past the jaw to the shoulders. Its top
      // edge tucks under the cap and its bottom edge flares, which is all "shoulder-length"
      // needs to be at this size.
      const bottom = d.shoulder - d.chin + 0.02
      const top = r * 1.05
      const fall = [
        new THREE.Vector2(r * 1.19, bottom),
        new THREE.Vector2(r * 1.15, bottom + (top - bottom) * 0.45),
        new THREE.Vector2(r * 1.06, top),
      ]
      shape.add(this.mesh(new THREE.LatheGeometry(fall, 14, -covered / 2, covered), HAIR))
    }

    if (b.hair === 'ponytail') {
      // Outside the oval group: a tail squashed by the skull's own scale looks like a fin.
      const tail = this.mesh(capsule(r * 0.3, r * 1.3), HAIR)
      tail.position.set(0, r * 1.5, r * b.skullD * 0.95)
      tail.rotation.x = -0.5
      this.head.add(tail)
    }
  }

  private buildArm(b: Build, side: Side) {
    const d = this.dims
    const o = b.outfit

    const root = new THREE.Group()
    root.position.set(side * d.armX, d.shoulderJoint - d.waist, 0)
    // Arms hang a little clear of the ribs rather than welded to them.
    root.rotation.z = ARM_SPREAD * side
    this.torso.add(root)
    root.add(this.mesh(capsule(d.upperArmR, d.upperArm), SKIN))

    if (o.sleeve > 0) {
      const sleeve = this.mesh(capsule(d.upperArmR * 1.28, d.upperArm * o.sleeve), o.top)
      sleeve.position.y = d.head * 0.06
      root.add(sleeve)
    }

    const joint = new THREE.Group()
    joint.position.y = -d.upperArm
    root.add(joint)
    joint.add(this.mesh(capsule(d.foreArmR, d.foreArm), SKIN))

    // An arm hangs with the palm to the thigh, so a hand is thin across x and broad in z.
    const hand = this.mesh(this.sphere(d.hand / 2), SKIN)
    hand.position.y = -d.foreArm - d.hand / 2
    hand.scale.set(0.3, 1, 0.62)
    joint.add(hand)

    this.limbs.push({ kind: 'arm', side, root, joint, foot: null })
  }

  private buildLeg(b: Build, side: Side) {
    const d = this.dims
    const o = b.outfit
    const cloth = o.legs ?? SKIN

    const root = new THREE.Group()
    root.position.set(side * d.legX, d.hip, 0)
    this.bob.add(root)
    root.add(this.mesh(capsule(d.thighR, d.hip - d.knee), cloth))

    const joint = new THREE.Group()
    joint.position.y = d.knee - d.hip
    root.add(joint)
    joint.add(this.mesh(capsule(d.shinR, d.knee - d.ankle), cloth))

    // There is no toe to roll over at this resolution, so a foot rigid to the shin drives
    // through the floor at toe-off. The ankle holds the sole flat instead.
    const foot = new THREE.Group()
    foot.position.y = d.ankle - d.knee
    joint.add(foot)

    const shoe = this.mesh(new THREE.BoxGeometry(d.footLen * 0.38, d.ankle * 1.08, d.footLen), o.shoes)
    // The ankle is about a quarter of the way back along the foot, and feet toe out.
    shoe.position.set(0, -d.ankle * 0.46, -d.footLen * 0.22)
    shoe.rotation.y = -0.08 * side
    foot.add(shoe)

    this.limbs.push({ kind: 'leg', side, root, joint, foot })
  }

  /** Advance the walk cycle. `speed` is metres per second — 0 eases back to standing. */
  update(dt: number, speed: number) {
    const d = this.dims
    const pace = Math.abs(speed)
    // The amplitude is what eases, not the pose: every offset below scales with it, so a figure
    // that stops walks its stride out and settles instead of freezing mid-step.
    this.swing += (Math.min(1, pace / d.cruise) - this.swing) * Math.min(1, dt * 5)
    // Cadence follows the real pace while moving, and the decaying amplitude once it stops.
    const cadence = pace > 0 ? Math.min(pace, d.cruise * 2.2) : this.swing * d.cruise
    if (cadence === 0 && this.swing < 0.004) {
      this.swing = 0
      this.phase = 0
    } else {
      this.phase = (this.phase + (TAU * cadence * dt) / d.stride) % TAU
    }
    this.pose()
  }

  private pose() {
    const d = this.dims
    const w = this.swing
    const sin = Math.sin(this.phase)
    const cos = Math.cos(this.phase)
    const thigh = d.hip - d.knee
    const shin = d.knee - d.ankle
    let reach = 0

    for (const limb of this.limbs) {
      const forward = sin * limb.side
      if (limb.kind === 'leg') {
        const hip = HIP_SWING * w * forward
        // The knee folds through the swing-through — the quarter cycle where the leg passes
        // under the body — and is all but straight through the stance.
        const pass = Math.max(0, cos * limb.side)
        const knee = -(KNEE_STAND + KNEE_FLEX * w * pass * pass)
        limb.root.rotation.x = hip
        limb.joint.rotation.x = knee
        if (limb.foot) limb.foot.rotation.x = -(hip + knee)
        reach = Math.max(reach, thigh * Math.cos(hip) + shin * Math.cos(hip + knee))
      } else {
        limb.root.rotation.x = -ARM_SWING * w * forward
        limb.joint.rotation.x = ELBOW_STAND + ELBOW_FLEX * w * Math.max(0, -forward)
      }
    }

    // The pelvis rides on whichever leg reaches furthest down, which is where the bob in a walk
    // comes from: spread the legs and the body has to drop. Working it out from the legs rather
    // than waving a sine at it is also the only thing keeping the soles on the floor.
    this.bob.position.y = reach - (d.hip - d.ankle)

    // Shoulders counter-rotate against the leading leg. The head mostly holds its own line,
    // which is what stops the twist reading as a stagger.
    this.torso.rotation.y = -TORSO_TWIST * w * sin
    this.torso.rotation.x = -TORSO_LEAN * w
    this.head.rotation.y = -this.torso.rotation.y * 0.6
  }

  dispose() {
    for (const geo of this.geometries) geo.dispose()
    this.geometries.clear()
    this.group.clear()
    this.group.removeFromParent()
  }
}
