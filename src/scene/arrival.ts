/**
 * Coming home: the car turns off the street, waits for the gate, descends the driveway and
 * parks in the garage once the door is up.
 *
 * The sequence is driven by *distance along a path*, not by a timeline. The car asks how fast
 * it may go at the point it has reached, and the gate and the door are called far enough ahead
 * that it never has to stop — but if either is still moving, the car holds short of it rather
 * than driving through. That is what makes it read as a sequence of causes rather than as a set
 * of clips playing at once.
 *
 * Plan (x, y) maps to world (x, z), as everywhere else here.
 */

import * as THREE from 'three'
import { LEVELS, SIZE } from '../model/house'
import { DRIVEWAY, groundAt } from '../model/site'
import { GATES, OFFSET, SECTION, footpathLevelAt, frontBoundaryY, kerbTopAt, roadLevelAt } from '../model/street'
import type { Car } from './vehicle'

/** What the sequence operates. Injected, so this module need not know how either one works. */
export interface ArrivalHooks {
  /** 0 = shut, 1 = fully open. */
  setVehicleGate(t: number): void
  setGarageDoor(t: number): void
}

/** How long each leaf takes to run, in seconds. Slow enough to watch. */
const GATE_TIME = 5.0
const DOOR_TIME = 4.0

/** Speeds in m/s: the street, the turn-in, the ramp, and the last few metres inside. */
const V_ROAD = 8.5
const V_TURN = 2.6
const V_RAMP = 1.7
const V_PARK = 1.0

/** Centre of the near lane, as an offset out from the boundary line. */
const LANE = OFFSET.channel + SECTION.carriageway / 4

/** The driveway axis: the gate, the ramp and the garage door all share it. */
const AXIS = (GATES.vehicle.x0 + GATES.vehicle.x1) / 2

type Phase = 'idle' | 'driving' | 'settling' | 'closing' | 'done'

export class Arrival {
  readonly group = new THREE.Group()

  private readonly curve: THREE.CatmullRomCurve3
  /** Arc-length table, so the car travels at a speed rather than at a `t`. */
  private readonly samples: THREE.Vector3[] = []
  private readonly lengths: number[] = []
  private readonly total: number

  /** Distance along the path at the gate line and at the garage door. */
  private readonly sGate: number
  private readonly sDoor: number

  private phase: Phase = 'idle'
  private s = 0
  private speed = 0
  private gate = 0
  private door = 0
  private heading = 0
  private hold = 0
  private finished?: () => void

  constructor(
    private readonly car: Car,
    private readonly hooks: ArrivalHooks,
  ) {
    this.group.name = 'arrival'
    this.group.add(car.group)
    this.group.visible = false

    const lane = (x: number) => frontBoundaryY(x) + LANE
    const gateY = frontBoundaryY(AXIS)
    // The turn-in is four points rather than one corner: a Catmull-Rom pulled through a right
    // angle overshoots into the neighbour's frontage on the way round.
    const wp: Array<[number, number]> = [
      [AXIS - 34, lane(AXIS - 34)],
      [AXIS - 16, lane(AXIS - 16)],
      [AXIS - 7.0, lane(AXIS - 7.0)],
      [AXIS - 3.0, lane(AXIS - 3.0) - 0.55],
      [AXIS - 0.35, gateY + 2.7],
      [AXIS, gateY + 0.7],
      [AXIS, gateY - 1.2],
      [AXIS, DRIVEWAY.yTop],
      [AXIS, 12.4],
      [AXIS, SIZE.depth],
      [AXIS, 8.6],
      [AXIS, 6.9],
    ]
    this.curve = new THREE.CatmullRomCurve3(
      wp.map(([x, y]) => new THREE.Vector3(x, 0, y)),
      false,
      'catmullrom',
      0.3,
    )

    // Tabulate arc length once. 700 samples over about 50 m is finer than anything the eye
    // catches at these speeds.
    const N = 700
    let run = 0
    let prev = this.curve.getPoint(0)
    this.samples.push(prev.clone())
    this.lengths.push(0)
    for (let i = 1; i <= N; i++) {
      const p = this.curve.getPoint(i / N)
      run += p.distanceTo(prev)
      this.samples.push(p.clone())
      this.lengths.push(run)
      prev = p
    }
    this.total = run

    this.sGate = this.distanceAtPlanY(gateY)
    this.sDoor = this.distanceAtPlanY(SIZE.depth)

    this.reset()
  }

  /** Where the path first reaches a given plan y, as a distance along it. */
  private distanceAtPlanY(y: number): number {
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1].z
      const b = this.samples[i].z
      if (a > y && b <= y) {
        const f = (a - y) / (a - b)
        return this.lengths[i - 1] + (this.lengths[i] - this.lengths[i - 1]) * f
      }
    }
    return this.total
  }

  private pointAt(s: number): THREE.Vector3 {
    const d = THREE.MathUtils.clamp(s, 0, this.total)
    let lo = 0
    let hi = this.lengths.length - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (this.lengths[mid] <= d) lo = mid
      else hi = mid
    }
    const span = this.lengths[hi] - this.lengths[lo]
    const f = span > 1e-6 ? (d - this.lengths[lo]) / span : 0
    return this.samples[lo].clone().lerp(this.samples[hi], f)
  }

  /**
   * Height of the surface under a wheel. Three surfaces meet on this route and none of them is
   * the plain terrain: the carriageway is crowned, the footpath is a plane from the boundary up
   * to the kerb — dished across the crossing, which is the only reason a car can cross it —
   * and inside the façade it is the garage slab. `groundAt()` covers the plot itself, ramp
   * included. The garage lip is blended over a metre rather than stepped, or the car visibly
   * hops through the door.
   */
  private deckAt(x: number, y: number): number {
    if (y <= SIZE.depth - 0.6) return LEVELS.caveFloor
    const b = frontBoundaryY(x)
    let z: number
    if (y <= b) z = groundAt(x, y)
    else if (y <= b + OFFSET.kerbFace) z = footpathLevelAt(x, y)
    else if (y <= b + OFFSET.channel) z = kerbTopAt(x)
    else z = roadLevelAt(x, y)
    if (y >= SIZE.depth + 0.4) return z
    const f = (y - (SIZE.depth - 0.6)) / 1.0
    return LEVELS.caveFloor + (z - LEVELS.caveFloor) * f
  }

  reset() {
    this.phase = 'idle'
    this.s = 0
    this.speed = 0
    this.gate = 0
    this.door = 0
    this.hold = 0
    this.heading = 0
    this.hooks.setVehicleGate(0)
    this.hooks.setGarageDoor(0)
    this.group.visible = false
    this.car.setLights(false)
    this.place()
  }

  start() {
    this.reset()
    this.phase = 'driving'
    this.group.visible = true
    this.car.setLights(true)
  }

  stop() {
    this.reset()
  }

  get running() {
    return this.phase !== 'idle' && this.phase !== 'done'
  }

  /** Notified once the car is parked and everything has shut again. */
  onFinish(fn: () => void) {
    this.finished = fn
  }

  /** Target speed at the point the car has reached, before the interlocks. */
  private cruise(): number {
    const toGate = this.sGate - this.s
    const toDoor = this.sDoor - this.s
    const toPark = this.total - this.s
    if (toPark < 3.5) return V_PARK
    if (toDoor < 6) return V_RAMP
    if (toGate < 9) return V_TURN
    if (toGate < 22) return V_TURN + (V_ROAD - V_TURN) * ((toGate - 9) / 13)
    return V_ROAD
  }

  update(dt: number) {
    if (!this.running) return

    if (this.phase === 'closing') {
      this.gate = Math.max(0, this.gate - dt / GATE_TIME)
      this.door = Math.max(0, this.door - dt / DOOR_TIME)
      this.hooks.setVehicleGate(this.gate)
      this.hooks.setGarageDoor(this.door)
      if (this.gate === 0 && this.door === 0) {
        this.phase = 'done'
        this.car.setLights(false)
        this.finished?.()
      }
      return
    }

    // The gate is called well before the car needs it; the door once the car is through the
    // gate and committed to the ramp.
    if (this.sGate - this.s < 24) this.gate = Math.min(1, this.gate + dt / GATE_TIME)
    if (this.s > this.sGate - 2 && this.sDoor - this.s < 11) this.door = Math.min(1, this.door + dt / DOOR_TIME)
    this.hooks.setVehicleGate(this.gate)
    this.hooks.setGarageDoor(this.door)

    if (this.phase === 'settling') {
      this.hold -= dt
      if (this.hold <= 0) this.phase = 'closing'
      return
    }

    let target = this.cruise()
    // Interlocks: hold short of anything still opening. 1.4 m is about a bonnet's length,
    // which is where a driver would actually stop.
    if (this.gate < 0.92) target = Math.min(target, Math.max(0, (this.sGate - 1.4 - this.s) * 0.9))
    if (this.door < 0.9) target = Math.min(target, Math.max(0, (this.sDoor - 1.4 - this.s) * 0.9))
    target = Math.min(target, Math.max(0, (this.total - this.s) * 1.2))

    // Ease onto the target instead of snapping to it, so the car reads as having a driver.
    const accel = target > this.speed ? 3.2 : 5.0
    this.speed += THREE.MathUtils.clamp(target - this.speed, -accel * dt, accel * dt)
    if (this.speed < 0.01) this.speed = 0

    this.s = Math.min(this.total, this.s + this.speed * dt)
    this.place()

    if (this.s >= this.total - 0.02 && this.speed === 0) {
      this.phase = 'settling'
      this.hold = 1.6
    }
  }

  /**
   * Put the car on the path.
   *
   * The body is not hung off one point: the deck is sampled at five stations from nose to tail
   * and a least-squares line through them gives the pitch, then the whole car is lifted until
   * no station is closer than the ride height. The drawn ramp falls 1.59 m in 4.15 m, and a car
   * pitched about its centre buries its nose in the break at both ends of that.
   */
  private place() {
    const p = this.pointAt(this.s)
    const heading = this.headingAt(this.s)
    this.heading = heading

    const sinH = Math.sin(heading)
    const cosH = Math.cos(heading)
    const half = this.car.length / 2
    let sumU = 0
    let sumZ = 0
    let sumUZ = 0
    let sumUU = 0
    const us: number[] = []
    const zs: number[] = []
    for (let i = 0; i < 5; i++) {
      // u runs forward from the centre, so a positive slope is nose-up.
      const u = -half + (i / 4) * this.car.length
      const z = this.deckAt(p.x - sinH * u, p.z - cosH * u)
      us.push(u)
      zs.push(z)
      sumU += u
      sumZ += z
      sumUZ += u * z
      sumUU += u * u
    }
    const n = us.length
    const slope = (n * sumUZ - sumU * sumZ) / (n * sumUU - sumU * sumU)
    let base = sumZ / n
    // Raise the fitted line until the tightest station still clears the ground.
    const RIDE = 0.03
    for (let i = 0; i < n; i++) base = Math.max(base, zs[i] + RIDE - slope * us[i])

    this.car.group.position.set(p.x, base, p.z)
    this.car.group.rotation.set(Math.atan(slope), heading, 0, 'YXZ')

    // Ackermann, near enough. Taken from the curvature of the path rather than from the turn
    // made since the last frame, so the wheels sit at the same angle whatever the frame rate.
    const kappa = shortestAngle(this.headingAt(this.s - 0.5), this.headingAt(this.s + 0.5))
    const steer = THREE.MathUtils.clamp(Math.atan(this.car.wheelbase * kappa), -0.55, 0.55)
    // The car's own `update` wants an odometer reading, not a step, and the arc length is one.
    this.car.update(this.s, steer)
  }

  /** Direction of travel at a distance along the path. Heading 0 faces −z, as the car is built. */
  private headingAt(s: number): number {
    const a = this.pointAt(Math.max(0, s - 0.35))
    const b = this.pointAt(Math.min(this.total, s + 0.35))
    return Math.atan2(a.x - b.x, a.z - b.z)
  }

  /**
   * Where to put the camera to watch. Three shots, because one rig cannot cover the whole run:
   * a wide from across the road while the car is still on the street and the gate is running,
   * a chase down the turn-in and the ramp, and a fixed shot from the corner of the garage once
   * the car is through the door — there is 2.60 m of headroom in there, so a chase camera has
   * nowhere to be that is not either inside the slab or buried in the ramp behind it.
   */
  cameraFrame(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const p = this.pointAt(this.s)
    const y = this.deckAt(p.x, p.z)
    const target = new THREE.Vector3(p.x, y + 0.9, p.z)

    if (this.sGate - this.s > 7) {
      // From the far verge, so the car comes across the frame with the gate and the house
      // behind it, rather than past a camera it is about to run over.
      const cx = AXIS + 9
      const cy = frontBoundaryY(cx) + OFFSET.outer - 0.8
      return { position: new THREE.Vector3(cx, this.deckAt(cx, cy) + 2.0, cy), target }
    }

    if (p.z < SIZE.depth - 0.4) {
      // Standing at the far corner of the garage, so the car comes towards the camera with the
      // door closing behind it. Any nearer and a 4.7 m car fills the frame.
      const cx = GATES.vehicle.x1 - 0.3
      return { position: new THREE.Vector3(cx, LEVELS.caveFloor + 1.6, 1.9), target }
    }

    const down = THREE.MathUtils.clamp((DRIVEWAY.yTop - p.z) / 4.0, 0, 1)
    const back = 8.4 - 2.2 * down
    const side = 1.8 * (1 - down)
    const cx = p.x + Math.sin(this.heading) * back + Math.cos(this.heading) * side
    const cz = p.z + Math.cos(this.heading) * back - Math.sin(this.heading) * side
    // Hold the camera above whatever is under *it*, not under the car: down the ramp the two
    // are more than a metre apart and the difference is the depth of the trench.
    const cy = Math.max(y + 3.6 - 1.4 * down, this.deckAt(cx, cz) + 1.6)
    return { position: new THREE.Vector3(cx, cy, cz), target }
  }
}

/** Signed difference between two headings, wrapped to ±π. */
function shortestAngle(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}
