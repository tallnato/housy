/**
 * The engineering specialties ("especialidades"), as data.
 *
 * Each discipline's project — water, drainage, rainwater, HVAC, electrical, telecoms, structure —
 * was extracted from its own drawing set into `src/data/specialties/<id>.json`, already in the
 * house's plan coordinates (metres from the outer rear-left corner, y towards the street). The
 * drawings are georeferenced; the JSON is not. Only the network geometry and short technical
 * labels were kept: no title blocks, no names, nothing that would place the house on a map.
 *
 * A discipline is split into layers, one per network and floor, so each can be switched on its
 * own. `notes.json` carries a few facts per discipline from the written parts of each project.
 */

import { LEVELS } from './house'

export type Bilingual = { pt: string; en: string }
export type SpecLevel = 'cave' | 'ground' | 'roof' | 'site'
export type SpecKind = 'pipe' | 'cable' | 'duct' | 'symbol' | 'zone' | 'structure'

export interface Solid {
  poly: Array<[number, number]>
  /** Absolute elevations on the project datum. */
  z0: number
  z1: number
  label?: string
}

export interface SpecLayer {
  id: string
  name: Bilingual
  color: string
  kind: SpecKind
  level: SpecLevel
  /** Height above the level's finished floor; on site, relative to the ground surface. */
  z: number
  note?: Bilingual
  lines: Array<Array<[number, number]>>
  circles: Array<[number, number, number]>
  texts: Array<[number, number, string, number, number]>
  solids?: Solid[]
}

export interface Discipline {
  id: string
  name: Bilingual
  summary?: Bilingual
  layers: SpecLayer[]
  /** Facts from the written parts, when there are any. */
  notes?: { pt: string[]; en: string[] }
}

/** The order the panel lists them in: the networks you would trace first, structure last. */
const ORDER = ['agua', 'esgotos', 'pluviais', 'eletricidade', 'ited', 'avac', 'scie', 'termica', 'acustica', 'estrutura']

const NAMES: Record<string, Bilingual> = {
  agua: { pt: 'Abastecimento de água', en: 'Water supply' },
  esgotos: { pt: 'Águas residuais', en: 'Wastewater' },
  pluviais: { pt: 'Águas pluviais', en: 'Rainwater' },
  eletricidade: { pt: 'Eletricidade', en: 'Electrical' },
  ited: { pt: 'Telecomunicações (ITED)', en: 'Telecoms (ITED)' },
  avac: { pt: 'AVAC', en: 'HVAC' },
  scie: { pt: 'Segurança contra incêndio', en: 'Fire safety' },
  termica: { pt: 'Comportamento térmico', en: 'Thermal performance' },
  acustica: { pt: 'Acústica', en: 'Acoustics' },
  estrutura: { pt: 'Estrutura', en: 'Structure' },
}

/** One swatch per discipline, for the panel: the colour of its first layer if it has one. */
const FALLBACK_COLOUR: Record<string, string> = {
  scie: '#e5484d',
  termica: '#f2994a',
  acustica: '#8e7cc3',
}

const files = import.meta.glob<{ default: unknown }>('../data/specialties/*.json', { eager: true })

function load(): Discipline[] {
  let notes: Record<string, { pt: string[]; en: string[] }> = {}
  const byId = new Map<string, Discipline>()
  for (const [path, mod] of Object.entries(files)) {
    const data = mod.default as Record<string, unknown>
    if (path.endsWith('/notes.json')) {
      notes = data as typeof notes
      continue
    }
    const d = data as unknown as Discipline
    if (!d?.id || !Array.isArray(d.layers)) continue
    for (const l of d.layers) {
      l.lines ??= []
      l.circles ??= []
      l.texts ??= []
    }
    byId.set(d.id, d)
  }
  // Disciplines that only have written notes still get a row: a fire-safety form with no
  // drawings is still worth reading.
  for (const id of Object.keys(notes)) {
    if (!byId.has(id)) byId.set(id, { id, name: NAMES[id] ?? { pt: id, en: id }, layers: [] })
  }
  for (const d of byId.values()) {
    d.notes = notes[d.id]
    d.name = NAMES[d.id] ?? d.name
  }
  const rank = (id: string) => (ORDER.indexOf(id) + 1 || 99)
  return [...byId.values()].sort((a, b) => rank(a.id) - rank(b.id))
}

export const DISCIPLINES: Discipline[] = load()

export function disciplineColour(d: Discipline): string {
  return d.layers[0]?.color ?? FALLBACK_COLOUR[d.id] ?? '#888888'
}

/** Finished floor a layer is measured from. Site layers follow the ground instead. */
export function levelBase(level: SpecLevel): number {
  switch (level) {
    case 'cave':
      return LEVELS.caveFloor
    case 'ground':
      return LEVELS.groundFloor
    case 'roof':
      return LEVELS.roofSurface
    case 'site':
      return 0
  }
}
