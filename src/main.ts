import * as THREE from 'three'
import './styles.css'
import { LEVELS, ROOMS, SCHEDULE, SIZE, roomArea, roomCentre, type Level } from './model/house'
import { SCHEMES, schemeById, AS_SPECIFIED, DESIGN_IDEAS } from './model/finishes'
import { MaterialLibrary } from './scene/materials'
import { buildHouse } from './scene/builder'
import { SPOT_LEVELS } from './model/site'
import { ENTRANCE_X, Viewer } from './scene/viewer'
import { Car } from './scene/vehicle'
import { Arrival } from './scene/arrival'
import { PEOPLE, Person, personById } from './scene/people'
import {
  LANGS,
  applyStatic,
  initLang,
  lang,
  onLangChange,
  setLang,
  t,
  tLevel,
  tNumber,
  tRoom,
  tRoomTip,
  tSchedule,
  tScheme,
  tSpot,
} from './i18n'

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T

// ─────────────────────────────────────────────────────────────────────────────
// Shareable state. `?view=posterior&floor=cave&scheme=dark-contrast` sets the
// viewer up on load, and the address bar tracks whatever you change.
// ─────────────────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search)

// Before anything renders, so the panel is never built in one language and read in another.
initLang(params.get('lang'))
let langInUrl = params.has('lang')
applyStatic()

const canvas = $<HTMLCanvasElement>('#view')
const viewer = new Viewer(canvas)

const lib = new MaterialLibrary(AS_SPECIFIED)
const parts = buildHouse(lib)
viewer.scene.add(parts.root)

/** Parameters that are applied once at load and are not controls; carried through verbatim. */
const PASSTHROUGH = ['view', 'cam', 'at', 'ui'] as const

function writeUrl() {
  const p = new URLSearchParams()
  for (const key of PASSTHROUGH) {
    const v = params.get(key)
    if (v !== null) p.set(key, v)
  }
  if (langInUrl) p.set('lang', lang())
  if (!labelsOn) p.set('labels', '0')
  if (floorMode !== 'all') p.set('floor', floorMode)
  if (!roofOn) p.set('roof', '0')
  if (!designOn) p.set('design', '0')
  if (!streetOn) p.set('street', '0')
  if (person) p.set('who', person.spec.id)
  if (lib.current.id !== AS_SPECIFIED.id) p.set('scheme', lib.current.id)
  const q = p.toString()
  history.replaceState(null, '', q ? `?${q}` : location.pathname)
}

// ─────────────────────────────────────────────────────────────────────────────
// Language
// ─────────────────────────────────────────────────────────────────────────────

// Everything the panel builds from data has to be re-read when the language changes, so each
// section registers what it wrote rather than being rebuilt — the room list carries click
// handlers, and throwing the elements away would throw those away with them.
const retranslators: Array<() => void> = []

const langEl = $('#lang')
for (const l of LANGS) {
  const b = document.createElement('button')
  b.type = 'button'
  b.dataset.lang = l.id
  b.textContent = l.label
  b.classList.toggle('on', l.id === lang())
  langEl.append(b)
}
langEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-lang]') as HTMLButtonElement | null
  if (!btn || btn.dataset.lang === lang()) return
  langInUrl = true
  setLang(btn.dataset.lang as 'en' | 'pt')
})

onLangChange((l) => {
  for (const b of langEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.lang === l)
  applyStatic()
  for (const fn of retranslators) fn()
  writeUrl()
})

// ─────────────────────────────────────────────────────────────────────────────
// Floors
// ─────────────────────────────────────────────────────────────────────────────

type FloorMode = 'all' | Level
let floorMode: FloorMode = 'all'
let roofOn = true

// Tucked into the underside of the roof band, so it belongs to the roof and not to the walls.
const cove = parts.exterior.getObjectByName('led-cove')

function applyVisibility() {
  parts.cave.visible = floorMode !== 'ground'
  parts.ground.visible = floorMode !== 'cave'
  // Glazing lives outside the floor groups, so it has to be told separately — otherwise
  // isolating a floor leaves the other one's windows hanging in mid-air.
  parts.glazingCave.visible = parts.cave.visible
  parts.glazingGround.visible = parts.ground.visible
  // Looking at one floor means looking down into it, so everything above it has to go:
  // the roof build-up, the slab it sits on, and — for the basement — the floor above.
  const open = floorMode !== 'all' || !roofOn
  parts.roof.visible = roofOn && !open
  parts.slabOverGround.visible = !open
  parts.slabOverCave.visible = floorMode !== 'cave'
  parts.stairs.visible = true
  if (cove) cove.visible = parts.roof.visible
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

// The street is outside the plot, so it hides on its own switch rather than with the site.
let streetOn = params.get('street') !== '0'
const streetToggle = $<HTMLInputElement>('#street-on')
streetToggle.checked = streetOn
streetToggle.addEventListener('change', () => {
  streetOn = streetToggle.checked
  parts.street.group.visible = streetOn
  writeUrl()
})

// ─────────────────────────────────────────────────────────────────────────────
// The design layer
// ─────────────────────────────────────────────────────────────────────────────

// Everything taken from the reference renders rather than from the drawing set. It is one
// switch because it is one proposal: the furniture, the timber slats and eaves lighting, and
// the garden all came out of the same images.
let designOn = params.get('design') !== '0'

function applyDesign() {
  parts.furnitureCave.visible = designOn
  parts.furnitureGround.visible = designOn
  parts.exterior.visible = designOn
  parts.planting.visible = designOn
  parts.setGlazingStyle(designOn ? 'renders' : 'drawn')
}

const designToggle = $<HTMLInputElement>('#design-on')
designToggle.checked = designOn
designToggle.addEventListener('change', () => {
  designOn = designToggle.checked
  applyDesign()
parts.street.group.visible = streetOn
  // The renders are a palette as much as a set of objects, so the finishes follow the switch —
  // but only while the two still agree, so a scheme picked by hand is never overruled.
  const from = designOn ? AS_SPECIFIED.id : DESIGN_IDEAS.id
  const to = designOn ? DESIGN_IDEAS.id : AS_SPECIFIED.id
  if (lib.current.id === from) selectScheme(to)
  writeUrl()
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
  [...parts.floors, parts.slabOverCave, parts.stairs, parts.paving, parts.street.paving],
  [
    parts.cave,
    parts.ground,
    parts.glazingCave,
    parts.glazingGround,
    parts.siteWalls,
    parts.street.solid,
  ],
)

const walkBtn = $<HTMLButtonElement>('#walk')
const hud = $('#hud')

function setWalk(on: boolean) {
  // The chrome is updated by the onModeChange listener below, so this only has to deal with
  // what walking requires of the model.
  viewer.setMode(on ? 'walk' : 'orbit')
  if (on) {
    roofOn = true
    floorMode = 'all'
    for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b.dataset.floor === 'all')
    $<HTMLInputElement>('#roof-on').checked = true
    applyVisibility()
    writeUrl()
  }
}

walkBtn.addEventListener('click', () => {
  setWalk(viewer.cameraMode !== 'walk')
  // Otherwise the button keeps focus and the first Space or Enter throws you back out.
  walkBtn.blur()
})

// flyTo() and losing pointer lock both drop the viewer back to orbit on their own, so the
// button and the HUD follow the viewer rather than the other way round.
function paintWalkButton() {
  const on = viewer.cameraMode === 'walk'
  walkBtn.classList.toggle('on', on)
  walkBtn.textContent = on ? t('ui.walkLeave') : t('ui.walk')
  hud.hidden = !on
}
viewer.onModeChange(paintWalkButton)
retranslators.push(paintWalkButton)

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && viewer.cameraMode === 'walk') setWalk(false)
})

// ─────────────────────────────────────────────────────────────────────────────
// Who is walking
// ─────────────────────────────────────────────────────────────────────────────

// A 2.60 m ceiling and a 1.00 m window sill mean nothing on their own. Pick one of the family
// and the walk camera drops to their eye height; standing them in the plan says the same thing
// from outside. Both are the same figure — the avatar mirrors the walker, so what you see
// standing there is where you will be when you press Walk.
const peopleEl = $('#people')
const peopleNote = $('#people-note')
const defaultEye = viewer.eyeHeight
let person: Person | null = null

for (const spec of [null, ...PEOPLE]) {
  const b = document.createElement('button')
  b.type = 'button'
  b.dataset.who = spec?.id ?? ''
  // Names are names in either language; only the empty choice needs translating, and it is
  // tagged so the language switch picks it up along with the rest of the static markup.
  if (spec) b.textContent = spec.name
  else {
    b.dataset.i18n = 'ui.peopleNone'
    b.textContent = t('ui.peopleNone')
  }
  peopleEl.append(b)
}

function paintPeople() {
  const id = person?.spec.id ?? ''
  for (const b of peopleEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.who === id)
  peopleNote.textContent = person
    ? t('ui.peopleNote')
        .replace('{name}', person.spec.name)
        .replace('{height}', tNumber(person.spec.height.toFixed(2)))
        .replace('{eyes}', tNumber(person.spec.eyeHeight.toFixed(2)))
    : ''
}

function setPerson(id: string | null) {
  if (person) {
    viewer.scene.remove(person.group)
    person.dispose()
    person = null
  }
  if (id) {
    person = new Person(personById(id))
    viewer.scene.add(person.group)
    // Where walk mode starts from when you come in off an orbit view, so the figure is
    // standing exactly where you would take over from it. Swapping who you are mid-walk must
    // not teleport you back out to the terrace, though.
    if (viewer.cameraMode !== 'walk') viewer.setWalkStand(ENTRANCE_X, SIZE.depth + 4.5, 0)
  }
  viewer.setEyeHeight(person?.spec.eyeHeight ?? defaultEye)
  paintPeople()
  writeUrl()
}

peopleEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-who]') as HTMLButtonElement | null
  if (!btn) return
  setPerson(btn.dataset.who || null)
})

viewer.onTick((dt) => {
  if (!person) return
  // Hidden while you are inside its head; still stepped, so it settles out of its stride
  // rather than snapping to attention the moment you leave.
  person.group.visible = viewer.cameraMode === 'orbit'
  person.group.position.copy(viewer.walkStand)
  person.group.rotation.y = viewer.walkHeading
  person.update(dt, viewer.cameraMode === 'walk' ? viewer.walkSpeed : 0)
})

retranslators.push(paintPeople)

// ─────────────────────────────────────────────────────────────────────────────
// Coming home
// ─────────────────────────────────────────────────────────────────────────────

const car = new Car()
const arrival = new Arrival(car, {
  setVehicleGate: (t) => parts.street.setVehicleGate(t),
  setGarageDoor: (t) => parts.garageDoor.setOpen(t),
})
viewer.scene.add(arrival.group)

const arrivalBtn = $<HTMLButtonElement>('#arrival')
let followCar = false

function paintArrivalButton() {
  arrivalBtn.classList.toggle('on', arrival.running)
  arrivalBtn.textContent = arrival.running ? t('ui.arrivalStop') : t('ui.arrival')
}
retranslators.push(paintArrivalButton)

arrivalBtn.addEventListener('click', () => {
  if (arrival.running) {
    arrival.stop()
  } else {
    // There is nothing to arrive along if the street is switched off, and nothing to watch
    // from inside the house.
    if (!streetOn) {
      streetOn = true
      streetToggle.checked = true
      parts.street.group.visible = true
      writeUrl()
    }
    if (viewer.cameraMode === 'walk') setWalk(false)
    arrival.start()
    followCar = true
  }
  paintArrivalButton()
  arrivalBtn.blur()
})

arrival.onFinish(() => {
  followCar = false
  paintArrivalButton()
})

// Touching the model hands the camera back. The car carries on either way — you are watching
// it, not driving it.
canvas.addEventListener('pointerdown', () => {
  followCar = false
})

viewer.onTick((dt) => {
  arrival.update(dt)
  if (!followCar || !arrival.running || viewer.cameraMode !== 'orbit') return
  // This runs after OrbitControls has had its go at the camera, so it wins for the frame; and
  // because the target is moved with it, letting go leaves the orbit anchored on the car.
  const f = arrival.cameraFrame()
  const k = Math.min(1, dt * 6)
  viewer.camera.position.lerp(f.position, k)
  viewer.controls.target.lerp(f.target, k)
  viewer.camera.lookAt(viewer.controls.target)
})

// ─────────────────────────────────────────────────────────────────────────────
// Finishes — the hook the inspiration picker plugs into
// ─────────────────────────────────────────────────────────────────────────────

const schemesEl = $('#schemes')
const schemeNote = $('#scheme-note')
const schemeLabels: Array<{ id: string; label: Text }> = []

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
  const label = document.createTextNode(tScheme(s.id, 'name', s.name))
  b.append(sw, label)
  schemesEl.append(b)
  schemeLabels.push({ id: s.id, label })
}
schemeNote.textContent = tScheme(AS_SPECIFIED.id, 'note', AS_SPECIFIED.note)

function selectScheme(id: string) {
  const scheme = schemeById(id)
  lib.apply(scheme)
  schemeNote.textContent = tScheme(scheme.id, 'note', scheme.note)
  for (const b of schemesEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.scheme === scheme.id)
  writeUrl()
}

schemesEl.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button[data-scheme]') as HTMLButtonElement | null
  if (btn) selectScheme(btn.dataset.scheme!)
})

retranslators.push(() => {
  for (const { id, label } of schemeLabels) label.data = tScheme(id, 'name', schemeById(id).name)
  schemeNote.textContent = tScheme(lib.current.id, 'note', lib.current.note)
})

// ─────────────────────────────────────────────────────────────────────────────
// Schedule + room list
// ─────────────────────────────────────────────────────────────────────────────

const dl = $('#schedule')
const scheduleRows = SCHEDULE.map((row) => {
  const dt = document.createElement('dt')
  const dd = document.createElement('dd')
  dl.append(dt, dd)
  return { row, dt, dd }
})

const roomList = $('#rooms')
const listedRooms = ROOMS.filter((r) => r.area)
const roomRows = listedRooms.map((r) => {
  const li = document.createElement('li')
  const label = document.createElement('span')
  const name = document.createTextNode('')
  const lvl = document.createElement('span')
  lvl.className = 'lvl'
  label.append(name, ' ', lvl)
  const area = document.createElement('span')
  area.className = 'area'
  li.append(label, area)
  li.addEventListener('click', () => {
    const y = (r.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor) + 1.4
    const [cx, cy] = roomCentre(r)
    const target = new THREE.Vector3(cx, y, cy)
    viewer.flyTo(target.clone().add(new THREE.Vector3(-9, 11, 12)), target)
    floorMode = r.level
    for (const b of $('#floors').querySelectorAll('button')) b.classList.toggle('on', b.dataset.floor === r.level)
    applyVisibility()
    writeUrl()
  })
  roomList.append(li)
  return { room: r, li, name, lvl, area }
})

// ─────────────────────────────────────────────────────────────────────────────
// Floating room labels
// ─────────────────────────────────────────────────────────────────────────────

const labelLayer = document.createElement('div')
labelLayer.id = 'labels'
document.body.append(labelLayer)

const labels = listedRooms.map((r) => {
  const el = document.createElement('div')
  el.className = 'room-label'
  const strong = document.createElement('b')
  const em = document.createElement('i')
  el.append(strong, em)
  labelLayer.append(el)
  const [cx, cy] = roomCentre(r)
  return {
    el,
    strong,
    em,
    room: r,
    pos: new THREE.Vector3(cx, (r.level === 'cave' ? LEVELS.caveFloor : LEVELS.groundFloor) + 1.2, cy),
  }
})

// The spot levels the ground surface was reconstructed from, listed as the evidence.
const levelsEl = $('#levels')
const levelRows = SPOT_LEVELS.map((l) => {
  const li = document.createElement('li')
  const v = document.createElement('b')
  v.textContent = (l.z >= 0 ? '+' : '−') + Math.abs(l.z).toFixed(2)
  const note = document.createElement('span')
  li.append(v, note)
  levelsEl.append(li)
  return { spot: l, v, note }
})

/** Everything the data files supply, said in the current language. */
function paintData() {
  for (const { row, dt, dd } of scheduleRows) {
    dt.textContent = tSchedule(row.label)
    dd.textContent = tNumber(row.value)
  }
  for (const { room, li, name, lvl, area } of roomRows) {
    name.data = tRoom(room.name)
    lvl.textContent = tLevel(room.level)
    area.textContent = tNumber(room.area)
    // The printed figure against what the modelled rectangles actually measure.
    li.title = tRoomTip(room.original, room.area, roomArea(room))
  }
  for (const l of labels) {
    l.strong.textContent = tRoom(l.room.name)
    l.em.textContent = tNumber(l.room.area)
  }
  for (const { spot, v, note } of levelRows) {
    v.textContent = tNumber((spot.z >= 0 ? '+' : '−') + Math.abs(spot.z).toFixed(2))
    note.textContent = tSpot(spot.note)
  }
}
paintData()
retranslators.push(paintData)

let labelsOn = true
$<HTMLInputElement>('#labels-on').addEventListener('change', (e) => {
  labelsOn = (e.target as HTMLInputElement).checked
  writeUrl()
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

applyDesign()
parts.street.group.visible = streetOn

// The design layer opens on by default, and with it the finishes it was drawn with; a scheme
// named in the link always wins.
const wantedScheme = params.get('scheme')
if (wantedScheme && SCHEMES.some((s) => s.id === wantedScheme)) selectScheme(wantedScheme)
else if (designOn) selectScheme(DESIGN_IDEAS.id)

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
const rawCam = params.get('cam')?.split(',').map(Number)
const camParam = rawCam?.length === 3 && rawCam.every(Number.isFinite) ? rawCam : undefined
const atParam = params.get('at')?.split(',').map(Number)
if (camParam) {
  viewer.camera.position.set(camParam[0], camParam[1], camParam[2])
  if (atParam?.length === 3 && atParam.every(Number.isFinite)) {
    viewer.controls.target.set(atParam[0], atParam[1], atParam[2])
  }
  // controls.update() re-derives the position from spherical coordinates and clamps the
  // distance, so widen the limits to take whatever the link asked for.
  const d = viewer.camera.position.distanceTo(viewer.controls.target)
  viewer.controls.minDistance = Math.min(viewer.controls.minDistance, d)
  viewer.controls.maxDistance = Math.max(viewer.controls.maxDistance, d)
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

const wantedWho = params.get('who')
if (wantedWho && PEOPLE.some((p) => p.id === wantedWho)) setPerson(wantedWho)
else paintPeople()

paintWalkButton()
paintArrivalButton()
writeUrl()

// One frame of geometry is up — take the splash away and drop it from the DOM.
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (!boot) return
  boot.classList.add('gone')
  setTimeout(() => boot.remove(), 500)
})
