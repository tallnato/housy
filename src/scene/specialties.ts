/**
 * The specialties in 3D: every network drawn as screen-space lines at the height its layer is
 * carried at, and the structure, where it was extracted, as translucent solids.
 *
 * The networks sit inside walls, under slabs and in the ground, so by default they are drawn in
 * x-ray: no depth test, always on top. Turn x-ray off and they hide behind whatever is in front
 * of them, which is the honest view of where they run.
 */

import * as THREE from 'three'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { DISCIPLINES, levelBase, type SpecKind, type SpecLayer, type SpecLevel } from '../model/specialties'
import { groundAt } from '../model/site'

const WIDTH: Record<SpecKind, number> = {
  pipe: 3,
  duct: 3.5,
  cable: 2,
  symbol: 1.6,
  zone: 1.4,
  structure: 1.4,
}

/** Site layers are draped over the ground, so long runs are cut short enough to follow it. */
const DRAPE_STEP = 0.75

export type FloorFilter = 'all' | 'cave' | 'ground'

interface Built {
  layer: SpecLayer
  discipline: string
  group: THREE.Group
  lineMat?: LineMaterial
  solidMat?: THREE.MeshStandardMaterial
}

export class SpecialtyLayers {
  readonly group = new THREE.Group()
  private readonly built: Built[] = []
  private readonly disciplineOn = new Set<string>()
  private readonly layerOff = new Set<string>()
  private floor: FloorFilter = 'all'
  private siteOn = true
  private xray = true

  constructor() {
    this.group.name = 'specialties'
    for (const d of DISCIPLINES) {
      for (const layer of d.layers) {
        const b = build(layer, d.id)
        this.built.push(b)
        this.group.add(b.group)
      }
    }
    this.apply()
  }

  get enabled(): ReadonlySet<string> {
    return this.disciplineOn
  }

  isLayerOn(id: string): boolean {
    return !this.layerOff.has(id)
  }

  setDiscipline(id: string, on: boolean) {
    if (on) this.disciplineOn.add(id)
    else this.disciplineOn.delete(id)
    this.apply()
  }

  setLayer(id: string, on: boolean) {
    if (on) this.layerOff.delete(id)
    else this.layerOff.add(id)
    this.apply()
  }

  setContext(floor: FloorFilter, siteOn: boolean) {
    this.floor = floor
    this.siteOn = siteOn
    this.apply()
  }

  setXray(on: boolean) {
    this.xray = on
    for (const b of this.built) {
      if (b.lineMat) {
        b.lineMat.depthTest = !on
        b.lineMat.needsUpdate = true
      }
      if (b.solidMat) {
        b.solidMat.depthTest = !on
        b.solidMat.opacity = on ? 0.35 : 0.85
        b.solidMat.needsUpdate = true
      }
      b.group.renderOrder = on ? 10 : 0
      b.group.traverse((o) => (o.renderOrder = b.group.renderOrder))
    }
  }

  get xrayOn() {
    return this.xray
  }

  /** LineMaterial works in pixels, so it has to know the canvas size. */
  setResolution(w: number, h: number) {
    for (const b of this.built) b.lineMat?.resolution.set(w, h)
  }

  private levelShown(level: SpecLevel): boolean {
    switch (level) {
      case 'cave':
        return this.floor !== 'ground'
      case 'ground':
        return this.floor !== 'cave'
      // The roof network only makes sense with the whole house standing under it.
      case 'roof':
        return this.floor === 'all'
      case 'site':
        return this.siteOn
    }
  }

  private apply() {
    for (const b of this.built) {
      b.group.visible =
        this.disciplineOn.has(b.discipline) && !this.layerOff.has(b.layer.id) && this.levelShown(b.layer.level)
    }
    this.group.visible = this.disciplineOn.size > 0
  }
}

function heightAt(layer: SpecLayer, x: number, y: number): number {
  return layer.level === 'site' ? groundAt(x, y) + layer.z : levelBase(layer.level) + layer.z
}

function circlePoints(cx: number, cy: number, r: number): Array<[number, number]> {
  const n = r < 0.1 ? 10 : 20
  const pts: Array<[number, number]> = []
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

function build(layer: SpecLayer, discipline: string): Built {
  const group = new THREE.Group()
  group.name = `spec-${layer.id}`
  const out: Built = { layer, discipline, group }

  const pos: number[] = []
  const push = (ax: number, ay: number, bx: number, by: number) => {
    if (layer.level === 'site') {
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / DRAPE_STEP))
      for (let i = 0; i < n; i++) {
        const x0 = ax + ((bx - ax) * i) / n
        const y0 = ay + ((by - ay) * i) / n
        const x1 = ax + ((bx - ax) * (i + 1)) / n
        const y1 = ay + ((by - ay) * (i + 1)) / n
        pos.push(x0, heightAt(layer, x0, y0), y0, x1, heightAt(layer, x1, y1), y1)
      }
    } else {
      const z = heightAt(layer, ax, ay)
      pos.push(ax, z, ay, bx, z, by)
    }
  }
  const polyline = (pts: Array<[number, number]>) => {
    for (let i = 0; i < pts.length - 1; i++) push(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
  }
  for (const l of layer.lines) polyline(l)
  for (const [cx, cy, r] of layer.circles) polyline(circlePoints(cx, cy, r))

  if (pos.length) {
    const geo = new LineSegmentsGeometry()
    geo.setPositions(pos)
    const mat = new LineMaterial({
      color: layer.color,
      linewidth: WIDTH[layer.kind] ?? 2,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    })
    const lines = new LineSegments2(geo, mat)
    lines.renderOrder = 10
    lines.frustumCulled = false
    group.add(lines)
    out.lineMat = mat
  }

  if (layer.solids?.length) {
    const mat = new THREE.MeshStandardMaterial({
      color: layer.color,
      roughness: 0.9,
      transparent: true,
      opacity: 0.35,
      depthTest: false,
      depthWrite: false,
    })
    for (const s of layer.solids) {
      if (s.poly.length < 3 || !(s.z1 > s.z0)) continue
      const shape = new THREE.Shape(s.poly.map(([x, y]) => new THREE.Vector2(x, y)))
      const geo = new THREE.ExtrudeGeometry(shape, { depth: s.z1 - s.z0, bevelEnabled: false })
      // Extruded along local z; a quarter turn about x lays plan y onto world z and sends the
      // extrusion downwards, so the solid hangs from z1 to z0.
      const m = new THREE.Mesh(geo, mat)
      m.rotation.x = Math.PI / 2
      m.position.y = s.z1
      m.renderOrder = 10
      group.add(m)
    }
    out.solidMat = mat
  }

  return out
}
