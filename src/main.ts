import * as THREE from 'three'
import './styles.css'
import { LEVELS, ROOMS, SCHEDULE, SIZE, roomArea, roomCentre, type Level } from './model/house'
import { SCHEMES, schemeById, AS_SPECIFIED } from './model/finishes'
import { MaterialLibrary } from './scene/materials'
import { buildHouse } from './scene/builder'
import { SPOT_LEVELS } from './model/site'
import { Viewer } from './scene/viewer'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T

const canvas = $<HTMLCanvasElement>('#view')
const viewer = new Viewer(canvas)

const lib = new MaterialLibrary(AS_SPECIFIED)
const parts = buildHouse(lib)
viewer.scene.add(parts.root)

// ─────────────────────────────────────────────────────────────────────────────
// Shareable state. `?view=posterior&floor=cave&scheme=dark-contrast&sun=325,42` sets the
// viewer up on load, and the address bar tracks whatever you change.
// ─────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search)

function writeUrl() {
  const p = new URLSearchParams()
  if (floorMode !== 'all') p.set('floor', floorMode)
  if (!roofOn) p.set('roof', '0')
  if (lib.current.id !== AS_SPECIFIED.id) p.set('scheme', lib.current.id)
  p.set('sun', `${az.value},${el.value}`)
  const q = p.toString()
  history.replaceState(null, '', q ? `?${q}` : location.pathname)
}

// ─────────────────────────────────────────────────────────────────────────────
// Floors
// ─────────────────────────────────────────────────────────────────────────────

type FloorMode = 'all' | Level
let floorMode: FloorMode = 'all'
let roofOn = true

function applyVisibility() {
  parts.cave.visible = floorMode !== 'ground'
  parts.ground.visible = floorMode !== 'cave'
  // Looking at one floor means looking down into it, so everything above it has to go:
  // the roof build-up, the slab it sits on, and — for the basement — the floor above.
  const open = floorMode !== 'all' || !roofOn
  parts.roof.visible = roofOn && !open
  parts.slabOverGround.visible = !open
  parts.slabOverCave.visible = floorMode !== 'cave'
  parts.stairs.visible = true
}

$('#floors').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-floor]') as HTMLButtonElement | null
  if (!btn) return
  floorMode = btn.dataset.floor as FloorMode
  for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b === btn)
  applyVisibility()
  writeUrl()
  if (floorMode !== 'all') lookDownOn(floorMode)
})

$<HTMLInputElement>('#roof-on').addEventListener('change', (e) => {
  roofOn = (e.target as HTMLInputElement).checked
  applyVisibility()
  writeUrl()
})
$<HTMLInputElement>('#site-on').addEventListener('change', (e) => {
  parts.site.visible = (e.target as HTMLInputElement).checked
})

// ─────────────────────────────────────────────────────────────────────────────
// Viewpoints
// ─────────────────────────────────────────────────────────────────────────────

const centre = new THREE.Vector3(SIZE.width / 2, LEVELS.groundFloor + 0.8, SIZE.depth / 2)

// Elevation viewpoints sit high enough to clear the boundary walls, which otherwise stand
// between the camera and the façade.
const VIEWS: Record<string, [THREE.Vector3, THREE.Vector3]> = {
  axo: [new THREE.Vector3(-17, 15, 31), centre],
  principal: [new THREE.Vector3(SIZE.width / 2, 11, SIZE.depth + 32), centre],
  posterior: [new THREE.Vector3(SIZE.width / 2, 11, -30), centre],
  esquerdo: [new THREE.Vector3(-31, 11, SIZE.depth / 2), centre],
  direito: [new THREE.Vector3(SIZE.width + 31, 11, SIZE.depth / 2), centre],
  topo: [new THREE.Vector3(SIZE.width / 2, 48, SIZE.depth / 2 + 0.02), centre],
}

$('#views').addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-view]') as HTMLButtonElement | null
  if (!btn) return
  const v = VIEWS[btn.dataset.view!]
  if (v) viewer.flyTo(v[0], v[1])
})

function lookDownOn(level: Level) {
  const y = level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor
  viewer.flyTo(
    new THREE.Vector3(SIZE.width / 2 - 6, y + 26, SIZE.depth / 2 + 15),
    new THREE.Vector3(SIZE.width / 2, y, SIZE.depth / 2),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk mode
// ─────────────────────────────────────────────────────────────────────────────

// Floors, slabs, stairs and the ground are what you stand on; walls and glazing are what you
// bump into. Both are raycast against the real geometry, so nothing is described twice.
viewer.setWalkGeometry(
  [parts.cave, parts.ground, parts.slabOverCave, parts.stairs, parts.site],
  [parts.cave, parts.ground, parts.glazing],
)

const walkBtn = $<HTMLButtonElement>('#walk')
const hud = $('#hud')

function setWalk(on: boolean) {
  viewer.setMode(on ? 'walk' : 'orbit')
  walkBtn.classList.toggle('on', on)
  walkBtn.textContent = on ? 'Sair do modo a pé' : 'Entrar na casa (modo a pé)'
  hud.hidden = !on
  if (on) {
    roofOn = true
    floorMode = 'all'
    for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b.dataset.floor === 'all')
    $<HTMLInputElement>('#roof-on').checked = true
    applyVisibility()
    writeUrl()
  }
}

walkBtn.addEventListener('click', () => setWalk(viewer.cameraMode !== 'walk'))
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewer.cameraMode === 'walk') setWalk(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Sun
// ─────────────────────────────────────────────────────────────────────────────

const az = $<HTMLInputElement>('#sun-az')
const el = $<HTMLInputElement>('#sun-el')
const updateSun = () => {
  viewer.setSun(+az.value, +el.value)
  $('#az-val').textContent = `${az.value}°`
  $('#el-val').textContent = `${el.value}°`
}
const updateSunAndUrl = () => {
  updateSun()
  writeUrl()
}
az.addEventListener('input', updateSunAndUrl)
el.addEventListener('input', updateSunAndUrl)
updateSun()

// ─────────────────────────────────────────────────────────────────────────────
// Finishes — the hook the inspiration picker plugs into
// ─────────────────────────────────────────────────────────────────────────────

const schemesEl = $('#schemes')
for (const s of SCHEMES) {
  const b = document.createElement('button')
  b.type = 'button'
  b.dataset.scheme = s.id
  b.classList.toggle('on', s.id === AS_SPECIFIED.id)
  const sw = document.createElement('span')
  sw.className = 'swatch'
  for (const key of ['exteriorWall', 'pala', 'frame'] as const) {
    const i = document.createElement('i')
    i.style.background = s.surfaces[key].color
    sw.append(i)
  }
  b.append(sw, document.createTextNode(s.name))
  schemesEl.append(b)
}
const schemeNote = $('#scheme-note')
schemeNote.textContent = AS_SPECIFIED.note

schemesEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-scheme]') as HTMLButtonElement | null
  if (!btn) return
  const scheme = schemeById(btn.dataset.scheme!)
  lib.apply(scheme)
  schemeNote.textContent = scheme.note
  for (const b of schemesEl.querySelectorAll('button')) b.classList.toggle('on', b === btn)
  writeUrl()
})

// ─────────────────────────────────────────────────────────────────────────────
// Schedule + room list
// ─────────────────────────────────────────────────────────────────────────────

const dl = $('#schedule')
for (const row of SCHEDULE) {
  const dt = document.createElement('dt')
  dt.textContent = row.label
  const dd = document.createElement('dd')
  dd.textContent = row.value
  dl.append(dt, dd)
}

const roomList = $('#rooms')
ROOMS.filter((r) => r.area).forEach((r, i) => {
  const li = document.createElement('li')
  li.dataset.idx = String(i)
  li.innerHTML = `<span>${r.name} <span class="lvl">${r.level === 'cave' ? 'cave' : 'r/c'}</span></span><span class="area">${r.area}</span>`
  // The printed figure against what the modelled rectangles actually measure.
  li.title = `desenho ${r.area} · modelo ${roomArea(r).toFixed(1).replace('.', ',')} m²`
  li.addEventListener('click', () => {
    const y = (r.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor) + 1.4
    const [cx, cy] = roomCentre(r)
    const t = new THREE.Vector3(cx, y, cy)
    viewer.flyTo(t.clone().add(new THREE.Vector3(-9, 11, 12)), t)
    floorMode = r.level
    for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b.dataset.floor === r.level)
    applyVisibility()
  })
  roomList.append(li)
})

// ─────────────────────────────────────────────────────────────────────────────
// Floating room labels
// ─────────────────────────────────────────────────────────────────────────────

const labelLayer = document.createElement('div')
labelLayer.id = 'labels'
document.body.append(labelLayer)

const labels = ROOMS.filter((r) => r.area).map((r) => {
  const el = document.createElement('div')
  el.className = 'room-label'
  el.innerHTML = `<b>${r.name}</b><i>${r.area}</i>`
  labelLayer.append(el)
  const [cx, cy] = roomCentre(r)
  return {
    el,
    room: r,
    pos: new THREE.Vector3(cx, (r.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor) + 1.2, cy),
  }
})

let labelsOn = true
$<HTMLInputElement>('#labels-on').addEventListener('change', (e) => {
  labelsOn = (e.target as HTMLInputElement).checked
})

const projected = new THREE.Vector3()
viewer.onTick(() => {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  for (const l of labels) {
    const levelVisible = l.room.level === 'cave' ? parts.cave.visible : parts.ground.visible
    // Only worth showing once you can actually see into the plan — otherwise they hover over
    // a closed box and say nothing.
    const opened = floorMode !== 'all' || !roofOn
    const show = labelsOn && opened && levelVisible && viewer.cameraMode === 'orbit'
    if (!show) {
      l.el.classList.remove('vis')
      continue
    }
    projected.copy(l.pos).project(viewer.camera)
    const behind = projected.z > 1
    l.el.classList.toggle('vis', !behind)
    if (behind) continue
    l.el.style.left = `${((projected.x + 1) / 2) * w}px`
    l.el.style.top = `${((1 - projected.y) / 2) * h}px`
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Chrome
// ─────────────────────────────────────────────────────────────────────────────

// The spot levels the ground surface was reconstructed from, listed as the evidence.
const levelsEl = $('#levels')
for (const l of SPOT_LEVELS) {
  const li = document.createElement('li')
  const v = (l.z >= 0 ? '+' : '−') + Math.abs(l.z).toFixed(2).replace('.', ',')
  li.innerHTML = `<b>${v}</b><span>${l.note}</span>`
  levelsEl.append(li)
}

const help = $<HTMLDialogElement>('#help')
$('#help-toggle').addEventListener('click', () => help.showModal())
$('#panel-toggle').addEventListener('click', () => {
  const p = $('#panel')
  p.hidden = !p.hidden
})

// ─────────────────────────────────────────────────────────────────────────────
// Apply whatever the URL asked for
// ─────────────────────────────────────────────────────────────────────────────

// `?ui=0` strips the chrome and `?labels=0` the room names — handy for embedding the viewer
// or grabbing a clean still.
if (params.get('ui') === '0') {
  for (const sel of ['.topbar', '.panel', '.hud']) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) el.hidden = true
  }
}
if (params.get('labels') === '0') {
  labelsOn = false
  $<HTMLInputElement>('#labels-on').checked = false
}

const wantedSun = params.get('sun')?.split(',').map(Number)
if (wantedSun?.length === 2 && wantedSun.every(Number.isFinite)) {
  az.value = String(wantedSun[0])
  el.value = String(wantedSun[1])
  updateSun()
}

const wantedScheme = params.get('scheme')
if (wantedScheme) {
  const btn = schemesEl.querySelector<HTMLButtonElement>(`button[data-scheme="${CSS.escape(wantedScheme)}"]`)
  btn?.click()
}

const wantedFloor = params.get('floor')
if (wantedFloor === 'cave' || wantedFloor === 'ground') {
  floorMode = wantedFloor
  for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b.dataset.floor === wantedFloor)
}
if (params.get('roof') === '0') {
  roofOn = false
  $<HTMLInputElement>('#roof-on').checked = false
}

applyVisibility()

// `?cam=x,y,z&at=x,y,z` places the camera exactly, for linking to a specific view.
const camParam = params.get('cam')?.split(',').map(Number)
const atParam = params.get('at')?.split(',').map(Number)
if (camParam?.length === 3 && camParam.every(Number.isFinite)) {
  viewer.camera.position.set(camParam[0], camParam[1], camParam[2])
  if (atParam?.length === 3 && atParam.every(Number.isFinite)) {
    viewer.controls.target.set(atParam[0], atParam[1], atParam[2])
  }
  viewer.controls.update()
}

const wantedView = params.get('view')
if (!camParam && wantedView && VIEWS[wantedView]) {
  const [pos, target] = VIEWS[wantedView]
  viewer.camera.position.copy(pos)
  viewer.controls.target.copy(target)
  viewer.controls.update()
} else if (!camParam && (wantedFloor === 'cave' || wantedFloor === 'ground')) {
  lookDownOn(wantedFloor)
}

writeUrl()

// One frame of geometry is up — take the splash away and drop it from the DOM.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.classList.add('gone')
  setTimeout(() => boot.remove(), 500)
})
