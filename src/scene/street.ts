/**
 * The street: carriageway, kerbs, footpath, gates and their piers.
 *
 * Nothing here places the house — see `../model/street` for the rule this file keeps.
 *
 * Every surface is laid the way `pave()` in `builder.ts` lays paving: a subdivided
 * `PlaneGeometry` turned −90° about X with each vertex lifted onto a sampled level, so the road
 * sits on the terrain rather than over it. The one addition is that a strip's two long edges
 * follow functions of x instead of constant y, which is what carries the front boundary's skew
 * through the footpath. Get that wrong and a wedge of daylight opens between the plot — whose
 * ground mesh is clipped to it — and the pavement.
 */

import * as THREE from 'three'
import { BOUNDARY, groundAt } from '../model/site'
import {
  CENTRE_LINE,
  EXTENT,
  FRONTAGE,
  GATE,
  GATES,
  OFFSET,
  PATHS,
  UPLIGHTERS,
  crownLevelAt,
  farKerbTopAt,
  footpathLevelAt,
  frontBoundaryY,
  inGateOpening,
  kerbTopAt,
  roadLevelAt,
} from '../model/street'
import type { MaterialLibrary } from './materials'

export interface StreetParts {
  /** Everything: road, kerb, footpath, gates. */
  group: THREE.Group
  /** Footpath, kerbs, carriageway and the paths to the gates — what the walk camera stands on. */
  paving: THREE.Group
  /** Piers and gate leaves — solid to the walk camera. */
  solid: THREE.Group
  /** 0 = shut, 1 = fully open. */
  setVehicleGate(t: number): void
  setPedestrianGate(t: number): void
  readonly vehicleGateOpen: number
  readonly pedestrianGateOpen: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

/** Generated in a canvas, like everything else here: the build ships no binary assets. */
function asphaltTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)
  // Chippings first, then a fine grain over the whole thing.
  for (let i = 0; i < 6000; i++) {
    const v = 108 + Math.random() * 56
    ctx.fillStyle = `rgb(${v},${v},${v + 3})`
    ctx.beginPath()
    ctx.arc(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26
    img.data[i] += n
    img.data[i + 1] += n
    img.data[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  // Strips are given UVs in metres, so the tile size is set there and not here.
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/**
 * The street is not part of the house's palette, so these stay out of the shared library and
 * do not re-skin with it — the road does not change colour because the render does.
 */
const asphalt = new THREE.MeshStandardMaterial({
  color: '#4c4c4e',
  roughness: 0.97,
  metalness: 0,
  map: asphaltTexture(),
})
const anthracite = new THREE.MeshStandardMaterial({ color: '#33373a', roughness: 0.48, metalness: 0.35 })
const roadMarking = new THREE.MeshStandardMaterial({ color: '#b6b3a8', roughness: 0.9, metalness: 0 })
const uplighterFace = new THREE.MeshStandardMaterial({
  color: '#26262a',
  emissive: '#ffcb92',
  emissiveIntensity: 2.6,
  roughness: 0.55,
  metalness: 0,
})
/** The same earth `builder.ts` skirts the plot with, so the two edges read as one block. */
const subgrade = new THREE.MeshStandardMaterial({ color: '#6d6152', roughness: 1 })

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Plan y as a function of x — a line along the street. */
type Along = (x: number) => number
/** Height as a function of position in plan. */
type Level = (x: number, y: number) => number

/** UVs are laid out in metres and halved, so a shared library texture tiles at a sane size. */
const UV = 0.5

/**
 * A surface swept along the street between two lines. The plane's grid is remapped in plan as
 * well as lifted, which is the only way a strip can follow the skewed boundary at one edge and
 * a parallel offset at the other.
 */
function strip(x0: number, x1: number, inner: Along, outer: Along, level: Level, mat: THREE.Material, step = 1.2) {
  const across = Math.abs(outer((x0 + x1) / 2) - inner((x0 + x1) / 2))
  const nx = Math.max(2, Math.round(Math.abs(x1 - x0) / step))
  const ny = Math.max(1, Math.round(across / step))
  const geo = new THREE.PlaneGeometry(1, 1, nx, ny)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = x0 + (x1 - x0) * (pos.getX(i) + 0.5)
    // Local y runs backwards along plan y, so the inner edge has to be the far end of the
    // parameter to keep the winding — and the normals — the right way up.
    const t = 0.5 - pos.getY(i)
    const y = inner(x) + (outer(x) - inner(x)) * t
    pos.setXYZ(i, x, -y, level(x, y))
    uv.setXY(i, x * UV, (y - inner(x)) * UV)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.rotation.x = -Math.PI / 2
  m.receiveShadow = true
  return m
}

/**
 * A vertical face swept along the street — a kerb, or the skirt at the outer edge. It faces
 * +z as written; sweeping from x1 back to x0 turns it round to face the house.
 */
function face(x0: number, x1: number, at: Along, top: Along, bottom: Along, mat: THREE.Material, step = 1.2) {
  const nx = Math.max(2, Math.round(Math.abs(x1 - x0) / step))
  const geo = new THREE.PlaneGeometry(1, 1, nx, 1)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uv = geo.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = x0 + (x1 - x0) * (pos.getX(i) + 0.5)
    const t = pos.getY(i) + 0.5
    const y = bottom(x) + (top(x) - bottom(x)) * t
    pos.setXYZ(i, x, y, at(x))
    uv.setXY(i, x * UV, y * UV)
  }
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, mat)
  m.receiveShadow = true
  return m
}

/** One gate leaf: stiles, a top and a bottom rail, and the fine slatted infill. */
function gateLeaf(width: number): THREE.Group {
  const g = new THREE.Group()
  const { height: h, thickness: t, stile, topRail, bottomRail, slats, slatGap } = GATE
  g.add(mesh(box(stile, h, t), anthracite, (stile - width) / 2, h / 2, 0))
  g.add(mesh(box(stile, h, t), anthracite, (width - stile) / 2, h / 2, 0))
  g.add(mesh(box(width, bottomRail, t), anthracite, 0, bottomRail / 2, 0))
  g.add(mesh(box(width, topRail, t), anthracite, 0, h - topRail / 2, 0))
  // The slats sit slightly proud of nothing — they are set back inside the frame, which is what
  // gives the leaf its shadow line in the render.
  const pitch = (h - topRail - bottomRail) / slats
  const slat = box(width - 2 * stile, pitch - slatGap, t * 0.7)
  for (let i = 0; i < slats; i++) {
    g.add(mesh(slat, anthracite, 0, bottomRail + (i + 0.5) * pitch, 0))
  }
  return g
}

// ─────────────────────────────────────────────────────────────────────────────

export function buildStreet(lib: MaterialLibrary): StreetParts {
  const group = new THREE.Group()
  const paving = new THREE.Group()
  const solid = new THREE.Group()
  group.name = 'street'
  paving.name = 'street-paving'
  solid.name = 'street-solid'
  group.add(paving, solid)

  const setts = lib.get('driveway')
  const concrete = lib.get('terrace')
  const rendered = lib.get('boundaryWall')

  const b = frontBoundaryY
  const at = (off: number): Along => (x) => b(x) + off
  // The dropped kerb dishes over 0.9 m, so the near half of the section is sampled finely
  // enough to show it. The carriageway only falls linearly in x, and does not need it.
  const fine = 0.4

  paving.add(strip(EXTENT.x0, EXTENT.x1, b, at(OFFSET.kerbFace), footpathLevelAt, setts, fine))
  paving.add(strip(EXTENT.x0, EXTENT.x1, at(OFFSET.kerbFace), at(OFFSET.channel), kerbTopAt, concrete, fine))
  paving.add(strip(EXTENT.x0, EXTENT.x1, at(OFFSET.channel), at(OFFSET.farChannel), roadLevelAt, asphalt))
  paving.add(strip(EXTENT.x0, EXTENT.x1, at(OFFSET.farChannel), at(OFFSET.farKerb), farKerbTopAt, concrete))
  paving.add(strip(EXTENT.x0, EXTENT.x1, at(OFFSET.farKerb), at(OFFSET.outer), farKerbTopAt, setts))

  // Kerb faces. The near one looks at the road; the far one looks back at the house, so its
  // sweep runs the other way to turn the normals round.
  const channelLevel = (off: number): Along => (x) => roadLevelAt(x, b(x) + off)
  group.add(face(EXTENT.x0, EXTENT.x1, at(OFFSET.channel), kerbTopAt, channelLevel(OFFSET.channel), concrete, fine))
  group.add(face(EXTENT.x1, EXTENT.x0, at(OFFSET.farChannel), farKerbTopAt, channelLevel(OFFSET.farChannel), concrete))
  // A shallow skirt at the outer edge, so the ribbon reads as a slab of ground and not a decal.
  group.add(face(EXTENT.x0, EXTENT.x1, at(OFFSET.outer), farKerbTopAt, (x) => farKerbTopAt(x) - 0.6, subgrade))

  // Faded broken centre line down the crown.
  const half = CENTRE_LINE.width / 2
  const period = CENTRE_LINE.mark + CENTRE_LINE.gap
  for (let x = EXTENT.x0 + CENTRE_LINE.gap / 2; x + CENTRE_LINE.mark < EXTENT.x1; x += period) {
    const dash = strip(x, x + CENTRE_LINE.mark, at(OFFSET.crown - half), at(OFFSET.crown + half),
      (px) => crownLevelAt(px) + 0.006, roadMarking, 0.5)
    group.add(dash)
  }

  // Paving from each gate back to something already paved. The 20 mm lift `pave()` uses to
  // clear the terrain is eased out over the last 0.4 m, so the threshold meets the footpath
  // flush rather than stepping down onto it.
  for (const p of PATHS) {
    const level: Level = (x, y) => groundAt(x, y) + 0.02 * Math.min(1, (b(x) - y) / 0.4)
    const x0 = p.gate.x0 - GATE.pier.size
    const x1 = p.gate.x1 + GATE.pier.size
    paving.add(strip(x0, x1, () => p.yInner, b, level, setts, 0.45))
  }

  // Piers each side of each opening, with a flat coping. They are founded 0.15 m down, as the
  // wall ribbon is, so their stated height is what stands above the paving.
  const embed = 0.15
  const { size: pier, coping } = GATE.pier
  for (const g of Object.values(GATES)) {
    for (const x of [g.x0 - pier / 2, g.x1 + pier / 2]) {
      const foot = groundAt(x, b(x)) - embed
      const h = GATE.pier.height + embed
      solid.add(mesh(box(pier, h, pier), rendered, x, foot + h / 2, b(x)))
      solid.add(mesh(box(pier + 0.06, coping, pier + 0.06), rendered, x, foot + h + coping / 2, b(x)))
    }
  }

  // Uplighters set into the street face of the wall, skipping the openings.
  const lamp = box(UPLIGHTERS.size, UPLIGHTERS.size, 0.02)
  const lamps = Math.round((FRONTAGE.x1 - FRONTAGE.x0) / UPLIGHTERS.spacing)
  for (let i = 0; i < lamps; i++) {
    const x = FRONTAGE.x0 + ((FRONTAGE.x1 - FRONTAGE.x0) * (i + 0.5)) / lamps
    if (inGateOpening(x)) continue
    // Half buried in the render, so it reads as set into the face rather than stuck onto it.
    const z = b(x) + BOUNDARY.wall.thickness / 2 + 0.005
    const m = mesh(lamp, uplighterFace, x, groundAt(x, b(x)) + UPLIGHTERS.above, z)
    m.castShadow = false
    group.add(m)
  }

  // ── The gates. Each leaf hangs from a pivot at its jamb and swings in (towards −y), so the
  // open leaves stand over the head of the ramp, clear of the street. `side` = +1 for a leaf
  // hung on its west jamb (extends towards +x), −1 for one hung on its east jamb.
  const gateLine = (x: number) => b(x) - GATE.setback
  const hang = (hingeX: number, width: number, side: 1 | -1) => {
    const pivot = new THREE.Group()
    pivot.position.set(hingeX, groundAt(hingeX, gateLine(hingeX)) + GATE.clearance, gateLine(hingeX))
    const leaf = gateLeaf(width)
    leaf.position.x = (side * width) / 2
    pivot.add(leaf)
    solid.add(pivot)
    return pivot
  }

  // Vehicle gate: a pair, hung on the outer jambs and meeting in the middle.
  const v = GATES.vehicle
  const vWidth = (v.x1 - v.x0) / 2 - GATE.jambGap - GATE.lap / 2
  const vehicleLeaves = [hang(v.x0 + GATE.jambGap, vWidth, 1), hang(v.x1 - GATE.jambGap, vWidth, -1)]
  let vehicleOpen = 0
  const placeVehicle = () => {
    const a = vehicleOpen * GATE.swing * (Math.PI / 180)
    vehicleLeaves[0].rotation.y = a
    vehicleLeaves[1].rotation.y = -a
  }

  // Pedestrian gate: a single leaf hung on its west jamb, so it opens along the path.
  const p = GATES.pedestrian
  const pWidth = p.x1 - p.x0 - 2 * GATE.jambGap
  const pivot = hang(p.x0 + GATE.jambGap, pWidth, 1)
  let pedestrianOpen = 0
  const placePedestrian = () => {
    pivot.rotation.y = pedestrianOpen * GATE.swing * (Math.PI / 180)
  }

  placeVehicle()
  placePedestrian()

  const clamp = (t: number) => Math.min(1, Math.max(0, t))
  return {
    group,
    paving,
    solid,
    setVehicleGate(t) {
      vehicleOpen = clamp(t)
      placeVehicle()
    },
    setPedestrianGate(t) {
      pedestrianOpen = clamp(t)
      placePedestrian()
    },
    get vehicleGateOpen() {
      return vehicleOpen
    },
    get pedestrianGateOpen() {
      return pedestrianOpen
    },
  }
}
