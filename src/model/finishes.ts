/**
 * Finishes — the materials palette, and the seam the "inspiration" feature plugs into.
 *
 * Every visible surface in the model belongs to one of a fixed set of `SurfaceId`s. A
 * `Scheme` assigns a material to each one. Swapping schemes at runtime re-skins the whole
 * house without touching the geometry, which is exactly what picking an inspiration should do.
 *
 * To add your own scheme later: copy one of the objects below, change the colours, and drop
 * a reference image into `public/inspiration/`. Nothing else needs to change.
 */

export type SurfaceId =
  | 'exteriorWall'
  | 'pala' // the projecting band that runs round the roof
  | 'parapet'
  | 'frame' // window and door frames
  | 'glass'
  | 'roof'
  | 'interiorWall'
  | 'ceiling'
  | 'floorLiving'
  | 'floorWet'
  | 'floorGarage'
  | 'stair'
  | 'terrace'
  | 'driveway'
  | 'boundaryWall'
  | 'ground'

export interface Finish {
  color: string
  roughness: number
  metalness: number
  /** 0–1; anything below 1 is rendered as a transparent material. */
  opacity?: number
  /** Subtle procedural texture applied at build time. */
  grain?: 'render' | 'gravel' | 'wood' | 'tile' | 'concrete' | 'grass' | 'none'
}

export interface Scheme {
  id: string
  name: string
  /** One line on where the look comes from, shown in the UI. */
  note: string
  /** Optional image in `public/inspiration/` that inspired the scheme. */
  image?: string
  surfaces: Record<SurfaceId, Finish>
}

/**
 * The scheme the architect actually specified, from the "Acabamentos" note on the drawings:
 *
 *   Paredes exteriores — monomassa sobre isolamento térmico — cinza, pala em branco
 *   Caixilharia        — alumínio termolacado com vidro duplo — cinza
 *   Cobertura          — godo lavado sobre telas asfálticas
 *   Muros e muretes    — areado pintado — branco
 */
export const AS_SPECIFIED: Scheme = {
  id: 'as-specified',
  name: 'Como projectado',
  note: 'The finishes written on the drawings: grey render, white band, grey aluminium frames.',
  surfaces: {
    exteriorWall: { color: '#9a9a97', roughness: 0.92, metalness: 0, grain: 'render' },
    pala: { color: '#f2f1ed', roughness: 0.85, metalness: 0, grain: 'render' },
    parapet: { color: '#f2f1ed', roughness: 0.85, metalness: 0, grain: 'render' },
    frame: { color: '#6b6d70', roughness: 0.45, metalness: 0.6 },
    glass: { color: '#9fb6c4', roughness: 0.06, metalness: 0.1, opacity: 0.26 },
    roof: { color: '#b3aca0', roughness: 1, metalness: 0, grain: 'gravel' },
    interiorWall: { color: '#f4f3f0', roughness: 0.95, metalness: 0 },
    ceiling: { color: '#fbfbf9', roughness: 0.98, metalness: 0 },
    floorLiving: { color: '#c8ad8c', roughness: 0.6, metalness: 0, grain: 'wood' },
    floorWet: { color: '#d9d6d0', roughness: 0.35, metalness: 0, grain: 'tile' },
    floorGarage: { color: '#8e8e8b', roughness: 0.9, metalness: 0, grain: 'concrete' },
    stair: { color: '#d8d5cf', roughness: 0.7, metalness: 0 },
    terrace: { color: '#b9b4aa', roughness: 0.9, metalness: 0, grain: 'concrete' },
    driveway: { color: '#8a8781', roughness: 0.95, metalness: 0, grain: 'concrete' },
    boundaryWall: { color: '#efeeea', roughness: 0.95, metalness: 0, grain: 'render' },
    ground: { color: '#8fa06a', roughness: 1, metalness: 0, grain: 'grass' },
  },
}

/** A warmer, softer take — off-white render and timber. */
export const WARM_MINIMAL: Scheme = {
  id: 'warm-minimal',
  name: 'Branco quente',
  note: 'Off-white render, oak frames, pale stone terraces.',
  surfaces: {
    ...AS_SPECIFIED.surfaces,
    exteriorWall: { color: '#ece7dd', roughness: 0.9, metalness: 0, grain: 'render' },
    pala: { color: '#fdfcf9', roughness: 0.85, metalness: 0, grain: 'render' },
    parapet: { color: '#fdfcf9', roughness: 0.85, metalness: 0, grain: 'render' },
    frame: { color: '#8a6a45', roughness: 0.7, metalness: 0.05 },
    roof: { color: '#cdc6b8', roughness: 1, metalness: 0, grain: 'gravel' },
    terrace: { color: '#d6cfc2', roughness: 0.85, metalness: 0, grain: 'concrete' },
    driveway: { color: '#b7b0a4', roughness: 0.95, metalness: 0, grain: 'concrete' },
  },
}

/** Dark and graphic. */
export const DARK_CONTRAST: Scheme = {
  id: 'dark-contrast',
  name: 'Cinza escuro',
  note: 'Charcoal render against a white band — the contrast the massing is drawn for.',
  surfaces: {
    ...AS_SPECIFIED.surfaces,
    exteriorWall: { color: '#4a4c4f', roughness: 0.88, metalness: 0, grain: 'render' },
    pala: { color: '#ffffff', roughness: 0.8, metalness: 0, grain: 'render' },
    parapet: { color: '#ffffff', roughness: 0.8, metalness: 0, grain: 'render' },
    frame: { color: '#232528', roughness: 0.4, metalness: 0.5 },
    roof: { color: '#7d7973', roughness: 1, metalness: 0, grain: 'gravel' },
    boundaryWall: { color: '#e7e5e0', roughness: 0.95, metalness: 0, grain: 'render' },
  },
}

/** A study model: no colour, just form. Useful for reading the massing. */
export const WHITE_MODEL: Scheme = {
  id: 'white-model',
  name: 'Maqueta',
  note: 'Everything in plaster white, so you read the shape and nothing else.',
  surfaces: Object.fromEntries(
    (Object.keys(AS_SPECIFIED.surfaces) as SurfaceId[]).map((k) => [
      k,
      k === 'glass'
        ? { color: '#cfd8dd', roughness: 0.1, metalness: 0, opacity: 0.35 }
        : k === 'ground'
          ? { color: '#dedbd4', roughness: 1, metalness: 0 }
          : { color: '#f0eeea', roughness: 0.85, metalness: 0 },
    ]),
  ) as Record<SurfaceId, Finish>,
}

export const SCHEMES: Scheme[] = [AS_SPECIFIED, WARM_MINIMAL, DARK_CONTRAST, WHITE_MODEL]

export function schemeById(id: string): Scheme {
  return SCHEMES.find((s) => s.id === id) ?? AS_SPECIFIED
}
