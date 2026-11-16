/**
 * The 2D plan: an SVG drawn from the same data as the 3D model — walls with their openings cut
 * out, room names, the plot — with the specialty layers that are switched on laid over it.
 *
 * SVG's y runs down the page, and so does the plan's: y grows towards the street, which is how
 * the drawings put the street at the bottom of the sheet. So plan coordinates go in unchanged.
 */

import { CAVE_WALLS, GROUND_WALLS, ROOMS, SIZE, STAIR, roomCentre, type Wall } from '../model/house'
import { DISCIPLINES, type SpecLayer } from '../model/specialties'
import { PLOT } from '../model/site'
import { lang, t, tRoom } from '../i18n'

export type PlanFloor = 'cave' | 'ground' | 'roof'

export interface PlanState {
  floor: PlanFloor
  isOn(disciplineId: string): boolean
  isLayerOn(layerId: string): boolean
}

const NS = 'http://www.w3.org/2000/svg'
const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}) => {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  return e
}
const f = (n: number) => n.toFixed(3)

/** The whole plot, with a margin; the initial view frames the house instead. */
const WORLD = { x: -9, y: -13, w: 34, h: 32 }
const HOUSE_VIEW = { x: -2.5, y: -1.8, w: SIZE.width + 5, h: SIZE.depth + 6.5 }

export class Plan2D {
  readonly svg: SVGSVGElement
  private readonly base: SVGGElement
  private readonly overlay: SVGGElement
  private view = { ...HOUSE_VIEW }
  private drag: { x: number; y: number; vx: number; vy: number } | null = null

  constructor(
    host: HTMLElement,
    private readonly state: PlanState,
    private readonly legend: HTMLElement,
  ) {
    this.svg = el('svg', { xmlns: NS, class: 'plan-svg', preserveAspectRatio: 'xMidYMid meet' })
    this.base = el('g', { class: 'plan-base' })
    this.overlay = el('g', { class: 'plan-overlay' })
    this.svg.append(this.base, this.overlay)
    host.append(this.svg)
    this.bindPanZoom()
    this.setView()
  }

  /** Rebuild everything. Cheap: a few thousand elements at most. */
  render() {
    this.base.replaceChildren()
    this.overlay.replaceChildren()
    this.drawBase()
    this.drawLayers()
  }

  resetView() {
    this.view = { ...HOUSE_VIEW }
    this.setView()
  }

  /** A standalone copy of what is on screen, for saving. */
  exportSvg(): string {
    const copy = this.svg.cloneNode(true) as SVGSVGElement
    copy.setAttribute('viewBox', `${WORLD.x} ${WORLD.y} ${WORLD.w} ${WORLD.h}`)
    copy.setAttribute('width', '1700')
    copy.setAttribute('height', '1600')
    const style = el('style')
    style.textContent = EXPORT_CSS
    copy.prepend(style)
    const bg = el('rect', { x: WORLD.x, y: WORLD.y, width: WORLD.w, height: WORLD.h, fill: '#ffffff' })
    style.after(bg)
    return new XMLSerializer().serializeToString(copy)
  }

  // ── base drawing ──────────────────────────────────────────────────────────

  private drawBase() {
    const g = this.base
    // The plot.
    g.append(el('polygon', { class: 'plot', points: PLOT.map(([x, y]) => `${f(x)},${f(y)}`).join(' ') }))

    const floor = this.state.floor === 'cave' ? 'cave' : 'ground'
    const walls = floor === 'cave' ? CAVE_WALLS : GROUND_WALLS
    if (this.state.floor === 'roof') {
      // The roof is a flat slab inside a parapet: the outline and the upstand are the plan.
      g.append(el('rect', { class: 'wall-ext', x: -0.3, y: -0.3, width: SIZE.width + 0.6, height: SIZE.depth + 0.6, fill: 'none' }))
      g.append(el('rect', { class: 'roof', x: 0.2, y: 0.2, width: SIZE.width - 0.4, height: SIZE.depth - 0.4 }))
    } else {
      for (const w of walls) this.drawWall(g, w)
      // Stair, as two flights and a landing.
      const s = STAIR
      const stair = el('g', { class: 'stair' })
      stair.append(el('rect', { x: s.x0, y: s.y0, width: s.x1 - s.x0, height: s.y1 - s.y0 }))
      const going = (s.flightTo - s.flightFrom) / (s.risersPerFlight - 1)
      for (let i = 0; i < s.risersPerFlight; i++) {
        const y = s.flightFrom + i * going
        stair.append(el('line', { x1: s.x0, y1: y, x2: s.x1, y2: y }))
      }
      stair.append(el('line', { x1: s.eastFlight.x0, y1: s.flightFrom, x2: s.eastFlight.x0, y2: s.flightTo }))
      g.append(stair)
      // Room names.
      for (const r of ROOMS) {
        if (r.level !== floor || !r.area) continue
        const [cx, cy] = roomCentre(r)
        const txt = el('text', { class: 'room', x: f(cx), y: f(cy) })
        txt.textContent = tRoom(r.name)
        g.append(txt)
      }
    }
  }

  private drawWall(g: SVGGElement, w: Wall) {
    const t = w.thickness
    const cls = w.exterior ? 'wall-ext' : 'wall'
    const rect = (a: number, b: number, c = cls) => {
      if (b - a <= 1e-4) return
      const r =
        w.run === 'x'
          ? { x: a, y: w.at - t / 2, width: b - a, height: t }
          : { x: w.at - t / 2, y: a, width: t, height: b - a }
      g.append(el('rect', { class: c, x: f(r.x), y: f(r.y), width: f(r.width), height: f(r.height) }))
    }
    const ops = [...(w.openings ?? [])].sort((a, b) => a.from - b.from)
    let at = w.from
    for (const o of ops) {
      rect(at, o.from)
      if (o.kind === 'window' || o.kind === 'french') {
        // Glazing: a thin pane on the centre line.
        const k = 0.025
        if (w.run === 'x') g.append(el('rect', { class: 'glass', x: f(o.from), y: f(w.at - k), width: f(o.to - o.from), height: f(2 * k) }))
        else g.append(el('rect', { class: 'glass', x: f(w.at - k), y: f(o.from), width: f(2 * k), height: f(o.to - o.from) }))
      } else if (o.kind === 'garage') {
        rect(o.from, o.to, 'door-garage')
      }
      at = o.to
    }
    rect(at, w.to)
  }

  // ── specialty layers ──────────────────────────────────────────────────────

  private layersShown(): SpecLayer[] {
    const out: SpecLayer[] = []
    for (const d of DISCIPLINES) {
      if (!this.state.isOn(d.id)) continue
      for (const l of d.layers) {
        if (!this.state.isLayerOn(l.id)) continue
        if (l.level === this.state.floor || l.level === 'site') out.push(l)
      }
    }
    return out
  }

  private drawLayers() {
    const shown = this.layersShown()
    const L = lang()
    for (const l of shown) {
      const g = el('g', { class: `spec spec-${l.kind}`, stroke: l.color, fill: 'none' })
      const title = el('title')
      title.textContent = l.name[L]
      g.append(title)
      for (const pts of l.lines) {
        g.append(el('polyline', { points: pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ') }))
      }
      for (const [x, y, r] of l.circles) g.append(el('circle', { cx: f(x), cy: f(y), r: f(r) }))
      for (const s of l.solids ?? []) {
        g.append(el('polygon', { class: 'solid', fill: l.color, points: s.poly.map(([x, y]) => `${f(x)},${f(y)}`).join(' ') }))
      }
      for (const [x, y, text, h, rot] of l.texts) {
        // CAD text rotates anticlockwise with y up; on this y-down sheet that is clockwise, so
        // the angle flips sign.
        const size = Math.max(0.12, Math.min(h || 0.18, 0.5))
        const tx = el('text', {
          class: 'spec-text',
          x: f(x),
          y: f(y),
          fill: l.color,
          'font-size': f(size),
          transform: rot ? `rotate(${-rot} ${f(x)} ${f(y)})` : '',
        })
        tx.textContent = text
        g.append(tx)
      }
      this.overlay.append(g)
    }

    // Legend: what is drawn, in its colour.
    this.legend.replaceChildren()
    if (!shown.length) {
      const p = document.createElement('p')
      p.className = 'note'
      p.textContent = t('ui.specPlanEmpty')
      this.legend.append(p)
      return
    }
    for (const l of shown) {
      const row = document.createElement('div')
      row.className = 'legend-row'
      const sw = document.createElement('i')
      sw.style.background = l.color
      const name = document.createElement('span')
      name.textContent = l.name[L]
      row.append(sw, name)
      if (l.note?.[L]) row.title = l.note[L]
      this.legend.append(row)
    }
  }

  // ── pan and zoom ──────────────────────────────────────────────────────────

  private setView() {
    const v = this.view
    this.svg.setAttribute('viewBox', `${f(v.x)} ${f(v.y)} ${f(v.w)} ${f(v.h)}`)
  }

  /** Plan coordinates under a client point, given how preserveAspectRatio fitted the box. */
  private toPlan(cx: number, cy: number) {
    const r = this.svg.getBoundingClientRect()
    const k = Math.max(this.view.w / r.width, this.view.h / r.height)
    const ox = (r.width * k - this.view.w) / 2
    const oy = (r.height * k - this.view.h) / 2
    return { x: this.view.x - ox + (cx - r.left) * k, y: this.view.y - oy + (cy - r.top) * k, k }
  }

  private bindPanZoom() {
    const svg = this.svg
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const p = this.toPlan(e.clientX, e.clientY)
        const s = Math.exp(e.deltaY * 0.0015)
        const w = Math.min(WORLD.w * 1.5, Math.max(1.5, this.view.w * s))
        const real = w / this.view.w
        this.view = {
          x: p.x - (p.x - this.view.x) * real,
          y: p.y - (p.y - this.view.y) * real,
          w,
          h: this.view.h * real,
        }
        this.setView()
      },
      { passive: false },
    )
    svg.addEventListener('pointerdown', (e) => {
      svg.setPointerCapture(e.pointerId)
      this.drag = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y }
    })
    svg.addEventListener('pointermove', (e) => {
      if (!this.drag) return
      const { k } = this.toPlan(e.clientX, e.clientY)
      this.view.x = this.drag.vx - (e.clientX - this.drag.x) * k
      this.view.y = this.drag.vy - (e.clientY - this.drag.y) * k
      this.setView()
    })
    const end = () => (this.drag = null)
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
    svg.addEventListener('dblclick', () => this.resetView())
  }
}

/** The styles the exported file needs, since it leaves the page's stylesheet behind. */
const EXPORT_CSS = `
.plot{fill:none;stroke:#9a9a9a;stroke-width:.04;stroke-dasharray:.3 .15}
.wall-ext{fill:#3a3a3a}.wall{fill:#6a6a6a}.glass{fill:#7fb3d5}.door-garage{fill:#c9c9c9}
.roof{fill:#eeeeee;stroke:#9a9a9a;stroke-width:.03}
.stair rect{fill:none;stroke:#9a9a9a;stroke-width:.02}.stair line{stroke:#b5b5b5;stroke-width:.02}
.room{font:0.32px sans-serif;fill:#8a8a8a;text-anchor:middle}
.spec polyline,.spec circle{stroke-width:.05;fill:none}.spec-symbol polyline,.spec-symbol circle{stroke-width:.03}
.spec .solid{fill-opacity:.35;stroke-width:.03}.spec-text{font-family:sans-serif;stroke:none}
`
