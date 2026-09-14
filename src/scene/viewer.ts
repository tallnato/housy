/**
 * Renderer, camera, lighting and the two ways of moving around: orbit and walk.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { LEVELS, SIZE } from '../model/house'
import { groundAt } from '../model/site'

export type CameraMode = 'orbit' | 'walk'

export class Viewer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  readonly sun: THREE.DirectionalLight
  readonly sky: THREE.HemisphereLight

  private mode: CameraMode = 'orbit'
  private readonly keys = new Set<string>()
  private walkYaw = Math.PI
  private walkPitch = 0
  private readonly walkPos = new THREE.Vector3(SIZE.width / 2, LEVELS.groundFloor + 1.65, SIZE.depth + 6)
  private pointerLocked = false
  private lastFrame = performance.now()
  private readonly onFrame: Array<(dt: number) => void> = []

  /** What the walk camera stands on and bumps into. */
  private walkables: THREE.Object3D[] = []
  private obstacles: THREE.Object3D[] = []
  private readonly ray = new THREE.Raycaster()

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.2

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color('#cfdce8')
    this.scene.fog = new THREE.Fog('#cfdce8', 90, 260)

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 600)
    this.camera.position.set(-16, 14, 30)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.target.set(SIZE.width / 2, LEVELS.groundFloor + 1, SIZE.depth / 2)
    this.controls.maxPolarAngle = Math.PI * 0.495
    this.controls.minDistance = 3
    this.controls.maxDistance = 140

    // Indirect light. Without it the shaded faces read as black, which is exactly wrong for a
    // rendered-and-painted house — those walls bounce a lot of light.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.05).texture
    this.scene.environmentIntensity = 0.55

    this.sky = new THREE.HemisphereLight(0xdcecff, 0x7d8464, 2.4)
    this.scene.add(this.sky)

    this.sun = new THREE.DirectionalLight(0xfff3e0, 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    // The default shadow frustum is ±5 — far too small for a 14 × 10.5 m house on a 707 m²
    // plot, and everything outside it reads as shadowed. Widen it and re-project.
    const cam = this.sun.shadow.camera
    cam.left = -34
    cam.right = 34
    cam.top = 34
    cam.bottom = -34
    cam.updateProjectionMatrix()
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.03
    this.sun.target.position.set(SIZE.width / 2, 0, SIZE.depth / 2)
    this.scene.add(this.sun, this.sun.target)
    this.setSun(325, 42)

    this.bindInput()
    addEventListener('resize', () => this.resize())
    this.resize()
    this.renderer.setAnimationLoop(() => this.tick())
  }

  /**
   * Places the sun. Azimuth in degrees clockwise from +Z (the street side), elevation in
   * degrees. The drawings carry no north point, so there is nothing to orient to: it is set
   * once, at an angle that lights the front and left façades and reads the massing well.
   */
  private setSun(azimuthDeg: number, elevationDeg: number) {
    const az = THREE.MathUtils.degToRad(azimuthDeg)
    const el = THREE.MathUtils.degToRad(Math.max(2, elevationDeg))
    const r = 70
    this.sun.position.set(
      SIZE.width / 2 + r * Math.cos(el) * Math.sin(az),
      r * Math.sin(el),
      SIZE.depth / 2 + r * Math.cos(el) * Math.cos(az),
    )
    // Warmer and dimmer near the horizon.
    const t = THREE.MathUtils.clamp(elevationDeg / 60, 0, 1)
    // three.js lights are in physical units: a Lambert surface returns albedo·intensity·NdotL/π,
    // so a "sunlight" that reads as sunlight wants an intensity around π and up.
    this.sun.intensity = 1.8 + 3.4 * t
    this.sun.color.setHSL(0.09 - 0.05 * t, 0.55 - 0.45 * t, 0.6 + 0.25 * t)
    this.sky.intensity = 1.6 + 1.6 * t
    this.scene.environmentIntensity = 0.55 + 0.5 * t
  }

  setMode(mode: CameraMode) {
    this.mode = mode
    this.controls.enabled = mode === 'orbit'
    if (mode === 'walk') {
      const near =
        this.camera.position.x > -8 &&
        this.camera.position.x < SIZE.width + 8 &&
        this.camera.position.z > -8 &&
        this.camera.position.z < SIZE.depth + 10 &&
        this.camera.position.y < 6

      if (near) {
        this.walkPos.copy(this.camera.position)
        const dir = new THREE.Vector3()
        this.camera.getWorldDirection(dir)
        this.walkYaw = Math.atan2(-dir.x, -dir.z)
        this.walkPitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
      } else {
        // Coming in from an orbit view: start on the path in front of the entrance, facing it.
        this.walkPos.set(5.5, 0, SIZE.depth + 4.5)
        this.walkYaw = Math.PI
        this.walkPitch = -0.05
      }
      this.walkPos.y = this.eyeHeightAt(this.walkPos.x, this.walkPos.z, this.walkPos.y + 2)
      this.canvas.requestPointerLock?.()
    } else {
      document.exitPointerLock?.()
      // Leaving walk mode with a stale orbit target would spin the camera round a point
      // somewhere behind it. Re-anchor on whatever the walker was facing.
      const dir = new THREE.Vector3()
      this.camera.getWorldDirection(dir)
      this.controls.target.copy(this.camera.position).addScaledVector(dir, 6)
      this.controls.update()
    }
  }

  get cameraMode() {
    return this.mode
  }

  onTick(fn: (dt: number) => void) {
    this.onFrame.push(fn)
  }

  /**
   * Tell the walk camera what to stand on and what to bump into. Everything is found by
   * raycasting the real geometry, so the stairs work as stairs and the terraces as terraces
   * without any of it being described twice.
   */
  setWalkGeometry(walkables: THREE.Object3D[], obstacles: THREE.Object3D[]) {
    this.walkables = walkables
    this.obstacles = obstacles
  }

  private static readonly EYE = 1.68
  private static readonly DOWN = new THREE.Vector3(0, -1, 0)

  /**
   * Eye height for the walk camera: cast down from a little above the head and stand on the
   * first surface found. Falls back to the terrain when nothing is hit.
   */
  private eyeHeightAt(x: number, z: number, fromY: number): number {
    const eye = Viewer.EYE
    if (this.walkables.length) {
      this.ray.set(new THREE.Vector3(x, fromY + 0.9, z), Viewer.DOWN)
      this.ray.far = 6
      const hit = this.ray.intersectObjects(this.walkables, true)[0]
      if (hit) return hit.point.y + eye
    }
    const inside = x > -0.2 && x < SIZE.width + 0.2 && z > -0.2 && z < SIZE.depth + 0.2
    if (!inside) return groundAt(x, z) + eye
    const current = fromY - eye
    return (current > LEVELS.groundFloor - 1.2 ? LEVELS.groundFloor : LEVELS.caveFloor) + eye
  }

  /** True if a step of `delta` from the current position would walk into something. */
  private blocked(delta: THREE.Vector3): boolean {
    if (!this.obstacles.length) return false
    const dir = delta.clone().normalize()
    // Chest height — low enough to catch balustrades, high enough to clear a tread.
    this.ray.set(new THREE.Vector3(this.walkPos.x, this.walkPos.y - 0.5, this.walkPos.z), dir)
    this.ray.far = delta.length() + 0.3
    return this.ray.intersectObjects(this.obstacles, true).length > 0
  }

  private bindInput() {
    addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      this.keys.add(e.code)
    })
    addEventListener('keyup', (e) => this.keys.delete(e.code))
    addEventListener('blur', () => this.keys.clear())

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas
    })
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'walk' && !this.pointerLocked) this.canvas.requestPointerLock?.()
    })
    addEventListener('mousemove', (e) => {
      if (this.mode !== 'walk' || !this.pointerLocked) return
      this.walkYaw -= e.movementX * 0.0022
      this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - e.movementY * 0.0022, -1.3, 1.3)
    })
  }

  private stepWalk(dt: number) {
    const speed = (this.keys.has('ShiftLeft') ? 5.2 : 2.3) * dt
    const forward = new THREE.Vector3(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw))
    const right = new THREE.Vector3(Math.cos(this.walkYaw), 0, -Math.sin(this.walkYaw))
    const move = new THREE.Vector3()
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) move.add(forward)
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) move.sub(forward)
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) move.add(right)
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) move.sub(right)
    if (move.lengthSq() > 0) {
      const step = move.normalize().multiplyScalar(speed)
      // Slide along whatever is in the way rather than sticking to it.
      if (!this.blocked(step)) {
        this.walkPos.add(step)
      } else {
        const alongX = new THREE.Vector3(step.x, 0, 0)
        const alongZ = new THREE.Vector3(0, 0, step.z)
        if (alongX.lengthSq() > 1e-8 && !this.blocked(alongX)) this.walkPos.add(alongX)
        else if (alongZ.lengthSq() > 1e-8 && !this.blocked(alongZ)) this.walkPos.add(alongZ)
      }
    }

    const targetY = this.eyeHeightAt(this.walkPos.x, this.walkPos.z, this.walkPos.y)
    this.walkPos.y += (targetY - this.walkPos.y) * Math.min(1, dt * 12)

    this.camera.position.copy(this.walkPos)
    const dir = new THREE.Vector3(
      -Math.sin(this.walkYaw) * Math.cos(this.walkPitch),
      Math.sin(this.walkPitch),
      -Math.cos(this.walkYaw) * Math.cos(this.walkPitch),
    )
    this.camera.lookAt(this.camera.position.clone().add(dir))
  }

  /** Fly the orbit camera to a viewpoint. */
  flyTo(position: THREE.Vector3, target: THREE.Vector3) {
    this.setMode('orbit')
    const from = this.camera.position.clone()
    const fromT = this.controls.target.clone()
    const start = performance.now()
    const dur = 750
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / dur)
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      this.camera.position.lerpVectors(from, position, e)
      this.controls.target.lerpVectors(fromT, target, e)
      this.controls.update()
      if (t < 1) requestAnimationFrame(step)
    }
    step()
  }

  private resize() {
    const w = this.canvas.clientWidth || innerWidth
    const h = this.canvas.clientHeight || innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick() {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    if (this.mode === 'orbit') this.controls.update()
    else this.stepWalk(dt)
    for (const fn of this.onFrame) fn(dt)
    this.renderer.render(this.scene, this.camera)
  }
}
