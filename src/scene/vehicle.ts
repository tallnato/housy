/**
 * A Tesla Model 3, generated the way the house is: from dimensions, with nothing loaded.
 *
 * The shell is one side profile extruded across the width. three.js bevels an extrusion by
 * swelling it *outwards* from the two end caps, so the profile drawn here is the silhouette you
 * see standing beside the car and the mid-plane stands proud of it by the bevel — flat flanks,
 * a crowned roof and bonnet, corners tucked in, which is how a car is actually surfaced.
 *
 * Ground plane at y = 0, origin at the centre of the footprint, nose towards −Z, so
 * `group.rotation.y` is the heading and matches the walk camera's forward vector.
 */

import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────────────────────
// Dimensions — the manufacturer's figures, in metres
// ─────────────────────────────────────────────────────────────────────────────

const LENGTH = 4.694
const WIDTH = 1.849
const HEIGHT = 1.443
const WHEELBASE = 2.875
const TRACK = 1.58
const WHEEL_R = 0.33
const TYRE_W = 0.235
/** 18" Aero: a 0.4572 m rim under a 235/45 tyre comes out at the quoted 0.66 m overall. */
const RIM_R = 0.2286
const CLEARANCE = 0.14
/** Front overhang proper — nose to front axle. The rear one is 0.978, and the three sum to LENGTH. */
const NOSE_TO_AXLE = 0.841

const AXLE_F = -LENGTH / 2 + NOSE_TO_AXLE
const AXLE_R = AXLE_F + WHEELBASE

/** Edge radius of the shell, and so also how far the mid-plane stands proud of the flank. */
const BODY_BEVEL = 0.04
const GLASS_BEVEL = 0.03
const CABIN_WIDTH = 1.73

/** Extremes of the drawn (flank) profile. The mid-plane reaches the full LENGTH and CLEARANCE. */
const TIP = LENGTH / 2 - BODY_BEVEL
const ROCKER = CLEARANCE + BODY_BEVEL

// The wheel openings. ARCH_R is set so that even the pinched mid-plane arc clears the tyre.
const ARCH_Y = 0.312
const ARCH_R = 0.408
const ARCH_A = Math.asin((ARCH_Y - ROCKER) / ARCH_R)
const ARCH_X = ARCH_R * Math.cos(ARCH_A)

/** Steering lock, past which the front tyres would foul their own arches. */
const MAX_LOCK = 0.55

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

/** Pearl White Multi-Coat. The clearcoat layer is what stops it reading as a white box. */
const PAINT = new THREE.MeshPhysicalMaterial({
  color: '#eef0f1',
  roughness: 0.25,
  metalness: 0.4,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
})
/** Opaque on purpose: there is no interior behind it, and tinted glass reads as a dark shell anyway. */
const GLASS = new THREE.MeshPhysicalMaterial({
  color: '#0b0e12',
  roughness: 0.07,
  metalness: 0.2,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
})
const TRIM = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: 0.55, metalness: 0.2 })
const RUBBER = new THREE.MeshStandardMaterial({ color: '#141517', roughness: 0.94 })
const LINER = new THREE.MeshStandardMaterial({ color: '#08090a', roughness: 1 })
const ALLOY = new THREE.MeshStandardMaterial({ color: '#949aa0', roughness: 0.38, metalness: 0.85 })
const ALLOY_DARK = new THREE.MeshStandardMaterial({ color: '#3a3f45', roughness: 0.5, metalness: 0.7 })
const HEAD_LAMP = new THREE.MeshStandardMaterial({
  color: '#dfe6ee',
  emissive: '#ffe9c4',
  emissiveIntensity: 0,
  roughness: 0.14,
  metalness: 0.1,
})
const TAIL_LAMP = new THREE.MeshStandardMaterial({
  color: '#5c1013',
  emissive: '#ff2a18',
  emissiveIntensity: 0,
  roughness: 0.24,
})

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A cylinder lying on the car's X axis — the axis every wheel, hub and stalk sits on. */
function axle(radius: number, length: number, segments: number): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segments)
  geo.rotateZ(Math.PI / 2)
  return geo
}

/**
 * Extrude a side profile across the car and stand it up in world axes. The shape is drawn in
 * (z, y); turning the result about Y lands the extrusion depth on the width axis and leaves the
 * profile where it was drawn.
 */
function extrudeAcross(shape: THREE.Shape, width: number, bevel: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 18,
    steps: 1,
  })
  geo.rotateY(-Math.PI / 2)
  geo.translate(width / 2 - bevel, 0, 0)
  return geo
}

/**
 * Squeeze a geometry laterally as it rises. This is the cabin's tumblehome: a Model 3's roof is
 * the better part of 0.35 m narrower than its shoulders, and without it the greenhouse reads as
 * a slab rather than a canopy.
 */
function tumblehome(geo: THREE.BufferGeometry, from: number, to: number, narrow: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - from) / (to - from), 0, 1)
    pos.setX(i, pos.getX(i) * (1 - narrow * t * t * (3 - 2 * t)))
  }
  geo.computeVertexNormals()
}

/**
 * Average the face normals meeting at each vertex, but only across edges that are already
 * shallow. ExtrudeGeometry hands back flat-shaded triangles and a four-facet bevel bands badly
 * on gloss paint; welding everything instead would round off the step down to the belt line and
 * the ridge at the boot, which have to stay crisp.
 */
function smooth(geo: THREE.BufferGeometry, maxAngle: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute
  const src = geo.attributes.normal as THREE.BufferAttribute
  const limit = Math.cos(maxAngle)
  const shared = new Map<string, number[]>()
  const q = (v: number) => Math.round(v * 4096)
  for (let i = 0; i < pos.count; i++) {
    const key = `${q(pos.getX(i))},${q(pos.getY(i))},${q(pos.getZ(i))}`
    const at = shared.get(key)
    if (at) at.push(i)
    else shared.set(key, [i])
  }
  const out = new Float32Array(src.count * 3)
  const here = new THREE.Vector3()
  const other = new THREE.Vector3()
  const sum = new THREE.Vector3()
  for (const group of shared.values()) {
    for (const i of group) {
      here.fromBufferAttribute(src, i)
      sum.copy(here)
      for (const j of group) {
        if (j === i) continue
        other.fromBufferAttribute(src, j)
        if (here.dot(other) >= limit) sum.add(other)
      }
      sum.normalize()
      out[i * 3] = sum.x
      out[i * 3 + 1] = sum.y
      out[i * 3 + 2] = sum.z
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3))
  return geo
}

// ─────────────────────────────────────────────────────────────────────────────
// The two profiles that do all the work
// ─────────────────────────────────────────────────────────────────────────────

/** Cut the wheel opening: an arc that undercuts past its own diameter, back onto the sill line. */
function archAt(s: THREE.Shape, at: number) {
  s.lineTo(at - ARCH_X, ROCKER)
  s.absarc(at, ARCH_Y, ARCH_R, Math.PI + ARCH_A, -ARCH_A, true)
}

/**
 * The body, drawn anticlockwise from under the front bumper. The greenhouse is not part of it:
 * the profile drops to the belt line between the cowl and the boot and leaves a trough for the
 * glass to stand in, since there is no CSG here to cut one afterwards.
 */
function bodyProfile(): THREE.Shape {
  const s = new THREE.Shape()

  // Underside: air dam, both wheel openings, rear bumper.
  s.moveTo(-2.246, 0.36)
  s.quadraticCurveTo(-2.206, 0.205, -2.01, ROCKER)
  archAt(s, AXLE_F)
  archAt(s, AXLE_R)
  s.lineTo(2.05, 0.198)
  s.quadraticCurveTo(2.252, 0.228, 2.284, 0.41)

  // Tail: upright between the bumper and the lamps, then rolling over onto the deck.
  s.lineTo(TIP, 0.56)
  s.lineTo(TIP, 0.905)
  s.quadraticCurveTo(2.29, 0.968, 2.196, 1.0)

  // A short, high boot lid climbing to the foot of the rear screen.
  s.quadraticCurveTo(1.94, 1.03, 1.716, 1.062)

  // Step down into the cabin trough and run the belt line forward, rising a little towards the rear.
  s.lineTo(1.556, 0.938)
  s.lineTo(-1.108, 0.898)

  // Cowl, bonnet, and a nose with nothing on it: no grille, just a fascia falling away.
  s.lineTo(-1.246, 0.93)
  s.quadraticCurveTo(-1.77, 0.922, -2.086, 0.842)
  s.quadraticCurveTo(-2.252, 0.8, -2.284, 0.726)
  s.quadraticCurveTo(-TIP, 0.668, -TIP, 0.59)
  s.lineTo(-TIP, 0.47)
  s.closePath()
  return s
}

/**
 * The greenhouse: one arc from the foot of the windscreen over the crown and down into the boot
 * lid, with no notch and no cross member, so the panoramic roof and the side glass read as a
 * single band. Its lower edge is deliberately buried in the body's trough.
 */
function cabinProfile(): THREE.Shape {
  const s = new THREE.Shape()
  s.moveTo(-1.31, 0.812)
  s.lineTo(1.8, 0.872)
  s.lineTo(1.726, 1.052) // foot of the rear screen, tucked under the boot lid's leading edge
  s.quadraticCurveTo(1.196, 1.284, 0.714, 1.378)
  s.quadraticCurveTo(0.266, 1.436, -0.188, 1.396) // crown, just behind the B-pillar
  s.quadraticCurveTo(-0.426, 1.376, -0.564, 1.336)
  s.quadraticCurveTo(-1.02, 1.15, -1.264, 0.922) // windscreen
  s.closePath()
  return s
}

// ─────────────────────────────────────────────────────────────────────────────
// The Aero wheel: a disc with a turbine face, not an open spoke
// ─────────────────────────────────────────────────────────────────────────────

function tyreGeometry(): THREE.BufferGeometry {
  const h = TYRE_W / 2
  const profile = [
    new THREE.Vector2(RIM_R, -h),
    new THREE.Vector2(0.3, -h),
    new THREE.Vector2(0.324, -h + 0.022),
    new THREE.Vector2(WHEEL_R, -h + 0.06),
    new THREE.Vector2(WHEEL_R, h - 0.06),
    new THREE.Vector2(0.324, h - 0.022),
    new THREE.Vector2(0.3, h),
    new THREE.Vector2(RIM_R, h),
  ]
  const geo = new THREE.LatheGeometry(profile, 36)
  geo.rotateZ(Math.PI / 2)
  return geo
}

function turbineGeometry(): THREE.BufferGeometry {
  const blades: THREE.Shape[] = []
  const count = 10
  const span = (Math.PI * 2) / count
  for (let i = 0; i < count; i++) {
    const a = i * span
    const s = new THREE.Shape()
    // The inner end lags the outer one, which is what makes the face look swept rather than starred.
    s.absarc(0, 0, 0.206, a, a + span * 0.62, false)
    s.absarc(0, 0, 0.074, a + span * 0.62 - 0.3, a - 0.3, true)
    s.closePath()
    blades.push(s)
  }
  const geo = new THREE.ExtrudeGeometry(blades, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
    curveSegments: 5,
    steps: 1,
  })
  geo.rotateY(Math.PI / 2)
  geo.translate(-0.006, 0, 0)
  return geo
}

// ─────────────────────────────────────────────────────────────────────────────
// Head-lamps. Given as a polyline so the lens can be re-derived a size down.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Where the lamps sit, read off the nose profile: under the bonnet's leading edge the fascia
 * leans back about 21° and falls away on roughly a 0.23 m radius. A lens laid flat across that
 * either floats at its ends or vanishes into the wing, so the lamp is bent to match.
 */
const NOSE_RAKE = 0.372
const NOSE_RADIUS = 0.23

/** Half a lamp in (lateral, along-the-fascia), pointed inboard and sweeping up into the wing. */
const LAMP_OUTLINE: Array<[number, number]> = [
  [0.27, 0.01],
  [0.33, -0.014],
  [0.43, -0.032],
  [0.56, -0.04],
  [0.68, -0.036],
  [0.775, -0.02],
  [0.822, 0.006],
  [0.83, 0.036],
  [0.8, 0.058],
  [0.74, 0.056],
  [0.63, 0.04],
  [0.5, 0.03],
  [0.38, 0.03],
  [0.3, 0.026],
]

function lampShape(inset: number): THREE.Shape {
  const cx = 0.55
  const cy = 0.008
  const k = 1 - inset
  const s = new THREE.Shape()
  LAMP_OUTLINE.forEach(([x, y], i) => {
    const px = cx + (x - cx) * k
    const py = cy + (y - cy) * k
    if (i === 0) s.moveTo(px, py)
    else s.lineTo(px, py)
  })
  s.closePath()
  return s
}

/** Roll a lamp around the nose, keeping its front face on the fascia over its whole height. */
function wrapToNose(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const angle = pos.getY(i) / NOSE_RADIUS
    const r = NOSE_RADIUS - pos.getZ(i)
    pos.setY(i, Math.sin(angle) * r)
    pos.setZ(i, NOSE_RADIUS - Math.cos(angle) * r)
  }
  geo.computeVertexNormals()
}

function lampGeometry(inset: number, depth: number, bevel: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(lampShape(inset), {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    steps: 1,
  })
  geo.translate(0, 0, bevel) // front face onto z = 0, so housing and lens wrap off the same plane
  wrapToNose(geo)
  return geo
}

// ─────────────────────────────────────────────────────────────────────────────

export class Car {
  /** Ground plane at y = 0, origin at the centre of the footprint, facing local −Z. */
  readonly group: THREE.Group = new THREE.Group()
  readonly length: number = LENGTH
  readonly width: number = WIDTH
  readonly height: number = HEIGHT
  /** Distance from the origin to the front axle, for placing the car on a path. */
  readonly frontOverhang: number = LENGTH / 2 - NOSE_TO_AXLE
  readonly wheelbase: number = WHEELBASE

  /** Front uprights, which turn; and all four hubs, which spin inside them. */
  private readonly uprights: THREE.Group[] = []
  private readonly hubs: THREE.Group[] = []
  // Cloned so two cars in one scene do not share a light switch.
  private readonly head = HEAD_LAMP.clone()
  private readonly tail = TAIL_LAMP.clone()

  constructor() {
    this.group.name = 'car'
    this.buildShell()
    this.buildDetails()
    this.buildLamps()
    this.buildWheels()
    this.setLights(false)
  }

  // ───────────────────────────────────────────────────────────────────────────

  private buildShell() {
    const body = smooth(extrudeAcross(bodyProfile(), WIDTH, BODY_BEVEL), 0.9)
    this.group.add(part(body, PAINT))

    const cabin = extrudeAcross(cabinProfile(), CABIN_WIDTH, GLASS_BEVEL)
    tumblehome(cabin, 0.98, 1.38, 0.2)
    const glass = part(smooth(cabin, 0.9), GLASS)
    glass.castShadow = false
    this.group.add(glass)

    // Arch liners: a dark block behind each pair of wheels, inboard of the tyres so it backs
    // them rather than hides them, and wide enough that you cannot see through the car.
    const wellHalf = TRACK / 2 - TYRE_W / 2 - 0.012
    for (const z of [AXLE_F, AXLE_R]) {
      this.group.add(part(box(wellHalf * 2, 0.67, 0.92), LINER, 0, 0.465, z))
    }
    // Black underbody, showing as a shadow line below the sill.
    this.group.add(part(box(1.7, 0.06, 4.0), LINER, 0, 0.12, 0))
  }

  private buildDetails() {
    const flank = WIDTH / 2

    // A shallow crease down each flank, as a diamond ridge that only catches a highlight.
    const crease = box(0.012, 0.012, 3.75)
    crease.rotateZ(Math.PI / 4)
    // Flush door handles: small horizontal pills, body colour, barely proud of the panel.
    const handle = box(0.016, 0.036, 0.135)
    // Panel gaps, drawn rather than modelled — three dark lines per side.
    const shut = box(0.008, 0.58, 0.006)
    // Mirror head, stalk and glass. 0.12 m of arm each side takes the car to its mirrored width.
    const pod = box(0.14, 0.072, 0.1)
    const stalk = axle(0.026, 0.1, 12)
    const mirror = box(0.11, 0.052, 0.006)

    for (const side of [-1, 1]) {
      this.group.add(part(crease, PAINT, side * (flank - 0.004), 0.755, 0.125))
      this.group.add(part(handle, PAINT, side * flank, 0.845, -0.6))
      this.group.add(part(handle, PAINT, side * flank, 0.845, 0.5))
      for (const z of [-1.05, 0.06, 0.95]) {
        this.group.add(part(shut, TRIM, side * (flank + 0.001), 0.59, z))
      }
      this.group.add(part(stalk, TRIM, side * 0.9, 0.985, -0.84))
      this.group.add(part(pod, PAINT, side * 0.9745, 1.005, -0.84))
      const pane = part(mirror, GLASS, side * 0.9745, 1.005, -0.786)
      pane.castShadow = false
      this.group.add(pane)
      // Corner intakes, raked outboard the way the bumper's are.
      const slot = part(box(0.055, 0.16, 0.03), TRIM, side * 0.735, 0.475, -2.337)
      slot.rotation.z = side * 0.2
      this.group.add(slot)
    }

    // Front: one wide low intake in an otherwise blank fascia, over a black valance.
    this.group.add(part(box(1.05, 0.115, 0.06), TRIM, 0, 0.4, -2.322))
    this.group.add(part(box(1.6, 0.07, 0.3), TRIM, 0, 0.225, -2.2))
    // Rear: valance and a boot lid whose trailing edge kicks up into a lip.
    this.group.add(part(box(1.58, 0.085, 0.34), TRIM, 0, 0.245, 2.16))
    const lip = part(box(1.62, 0.024, 0.115), PAINT, 0, 1.05, 2.155)
    lip.rotation.x = -0.12
    this.group.add(lip)
  }

  private buildLamps() {
    const housing = lampGeometry(0, 0.06, 0.006)
    const lens = lampGeometry(0.18, 0.03, 0.004)
    for (const side of [-1, 1]) {
      const unit = new THREE.Group()
      unit.position.set(0, 0.725, -2.3325)
      unit.rotation.x = NOSE_RAKE
      unit.scale.x = side
      unit.add(part(housing, TRIM), part(lens, this.head, 0, 0, -0.004))
      this.group.add(unit)
    }

    // The tail reads as one bar: two lit units bridged by a dark strip across the boot.
    const bar = box(0.4, 0.085, 0.035)
    for (const side of [-1, 1]) {
      this.group.add(part(bar, this.tail, side * 0.63, 0.875, 2.334))
    }
    this.group.add(part(box(0.9, 0.05, 0.02), TRIM, 0, 0.875, 2.34))
  }

  private buildWheels() {
    // Built once and shared: the outer face points at +x, and the left pair is mirrored.
    const tyre = tyreGeometry()
    const bore = axle(0.229, TYRE_W * 0.8, 24)
    const face = axle(0.222, 0.02, 32)
    const turbine = turbineGeometry()
    const cap = axle(0.048, 0.016, 20)

    for (const z of [AXLE_F, AXLE_R]) {
      for (const side of [-1, 1]) {
        const upright = new THREE.Group()
        upright.position.set((side * TRACK) / 2, WHEEL_R, z)
        const hub = new THREE.Group()
        // Mirrored inside the roll, so both sides turn the same way about the world X axis.
        hub.scale.x = side
        upright.add(hub)
        hub.add(part(tyre, RUBBER), part(bore, ALLOY_DARK))
        hub.add(part(face, ALLOY_DARK, 0.092, 0, 0), part(turbine, ALLOY, 0.1, 0, 0))
        hub.add(part(cap, ALLOY, 0.108, 0, 0))
        this.group.add(upright)
        this.hubs.push(hub)
        if (z === AXLE_F) this.uprights.push(upright)
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Roll the wheels by `distance` metres travelled and steer the front pair to `steer` radians.
   * Both are absolute: `distance` is the odometer, not the step since the last call, and a
   * positive `steer` turns towards the car's left. Steering is clamped to the lock.
   */
  update(distance: number, steer: number) {
    const lock = THREE.MathUtils.clamp(steer, -MAX_LOCK, MAX_LOCK)
    for (const upright of this.uprights) upright.rotation.y = lock
    // Negative about X: forward is −Z, so the top of the wheel has to travel that way too.
    for (const hub of this.hubs) hub.rotation.x = -distance / WHEEL_R
  }

  /** Head- and tail-lamps on or off. */
  setLights(on: boolean) {
    this.head.emissiveIntensity = on ? 1.8 : 0
    this.tail.emissiveIntensity = on ? 1.4 : 0.1
  }

  dispose() {
    const seen = new Set<THREE.BufferGeometry>()
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) seen.add(o.geometry)
    })
    for (const geo of seen) geo.dispose()
    this.head.dispose()
    this.tail.dispose()
  }
}
