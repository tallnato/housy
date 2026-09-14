/**
 * The interface in two languages: English, and the Portuguese the house was actually drawn in.
 *
 * The strings split in two. Everything the interface says of its own accord lives in the
 * catalogue below, keyed and typed. Everything the *data* says — room names, schedule labels,
 * spot-level notes, scheme names — stays in `model/` in English and is translated here by its
 * source text. Keeping the data files monolingual means they still read as a transcription of
 * the drawings, and a string nobody has translated yet degrades to English instead of vanishing.
 *
 * `Key` is derived from the English catalogue, so a missing Portuguese string is a compile
 * error rather than a hole in the panel.
 */

export type Lang = 'en' | 'pt'

export const LANGS: ReadonlyArray<{ id: Lang; label: string }> = [
  { id: 'en', label: 'EN' },
  { id: 'pt', label: 'PT' },
]

const STORE_KEY = 'houseviewer.lang'

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

const EN = {
  'ui.docTitle': 'House · 3D',
  'ui.docDescription':
    'Interactive 3D model of a two-storey house, built from its architectural drawings.',
  'ui.boot': 'building the model…',
  'ui.title': 'House',
  'ui.subtitle': 'single-family house · 147 m² footprint',
  'ui.about': 'About',
  'ui.panel': 'Panel',
  'ui.language': 'Language',

  'ui.floors': 'Floors',
  'ui.floorsAll': 'Both',
  'ui.floorCave': 'Basement',
  'ui.floorGround': 'Ground',
  'ui.roof': 'Roof',
  'ui.site': 'Site and walls',
  'ui.labels': 'Room names',

  'ui.view': 'View',
  'ui.viewAxo': 'Axonometric',
  'ui.viewFront': 'Front',
  'ui.viewRear': 'Rear',
  'ui.viewLeft': 'Left side',
  'ui.viewRight': 'Right side',
  'ui.viewPlan': 'Plan',
  'ui.walk': 'Walk through the house',
  'ui.walkLeave': 'Leave walk mode',

  'ui.finishes': 'Finishes',
  'ui.areas': 'Areas',
  'ui.rooms': 'Rooms',
  /** Placeholders are filled by `tRoomTip`. */
  'ui.roomTip': '{original} · drawing {area} · model {model} m²',
  'ui.levelCave': 'basement',
  'ui.levelGround': 'ground',

  'ui.hudWalking': 'Walking',
  'ui.hudKeys': 'WASD to move · mouse to look · Shift to run · Esc to leave',

  'ui.aboutTitle': 'About this model',
  'ui.aboutIntro':
    "Generated from the architect's drawing set — plans, sections and elevations at 1:100. " +
    'Every dimension was read from the vector geometry inside the drawings rather than ' +
    'estimated off the printed image.',
  'ui.aboutDims': 'Footprint 14.005 × 10.501 m · 2.60 m clear height on both floors',
  'ui.aboutLevels': 'Basement at −1.61 · ground floor at +1.54 · parapet at +4.99',
  'ui.aboutWalls': 'External walls 0.35 m · partitions 0.10 m',
  'ui.groundLevels': 'Ground levels',
  'ui.groundLevelsIntro':
    'The terrain is reconstructed from the levels dimensioned on the sections and elevations:',
  'ui.aboutNote':
    'The drawings carry no north point, so the sun sits at a fixed angle chosen to read the ' +
    'massing rather than a real orientation. The model holds no location information — no ' +
    'address, no streets, no coordinates — and the plot outline is stored only as offsets ' +
    "from the house's own corner.",
  'ui.close': 'Close',

  'ui.designIdeas': 'Design ideas',
  'ui.designIdeasNote': 'Looks taken from the reference renders, laid over the drawn geometry.',
  'ui.street': 'Street and gates',
  'ui.arrival': 'Watch the car arrive',
  'ui.arrivalStop': 'Stop',
  'ui.people': 'Walk as',
  'ui.peopleNone': 'No one',
  'ui.gateVehicle': 'Vehicle gate',
  'ui.gatePedestrian': 'Pedestrian gate',
  'ui.garageDoor': 'Garage door',
} as const

export type Key = keyof typeof EN

const PT: Record<Key, string> = {
  'ui.docTitle': 'Casa · 3D',
  'ui.docDescription':
    'Modelo 3D interativo de uma moradia de dois pisos, construído a partir das peças desenhadas.',
  'ui.boot': 'a construir o modelo…',
  'ui.title': 'Casa',
  'ui.subtitle': 'moradia unifamiliar · 147 m² de implantação',
  'ui.about': 'Sobre',
  'ui.panel': 'Painel',
  'ui.language': 'Idioma',

  'ui.floors': 'Pisos',
  'ui.floorsAll': 'Ambos',
  'ui.floorCave': 'Cave',
  // The segmented control is three buttons wide; 'Rés-do-chão' wraps in it and 'R/C' is what
  // a Portuguese lift button says anyway.
  'ui.floorGround': 'R/C',
  'ui.roof': 'Cobertura',
  'ui.site': 'Terreno e muros',
  'ui.labels': 'Nomes dos compartimentos',

  'ui.view': 'Vista',
  'ui.viewAxo': 'Axonometria',
  'ui.viewFront': 'Alçado principal',
  'ui.viewRear': 'Alçado posterior',
  'ui.viewLeft': 'Alçado esquerdo',
  'ui.viewRight': 'Alçado direito',
  'ui.viewPlan': 'Planta',
  'ui.walk': 'Percorrer a casa',
  'ui.walkLeave': 'Sair do percurso',

  'ui.finishes': 'Acabamentos',
  'ui.areas': 'Áreas',
  'ui.rooms': 'Compartimentos',
  'ui.roomTip': '{original} · desenho {area} · modelo {model} m²',
  'ui.levelCave': 'cave',
  'ui.levelGround': 'rés-do-chão',

  'ui.hudWalking': 'A percorrer',
  'ui.hudKeys': 'WASD para andar · rato para olhar · Shift para correr · Esc para sair',

  'ui.aboutTitle': 'Sobre este modelo',
  'ui.aboutIntro':
    'Gerado a partir das peças desenhadas do arquiteto — plantas, cortes e alçados à escala ' +
    '1:100. Todas as dimensões foram lidas da geometria vetorial dentro dos desenhos, e não ' +
    'estimadas sobre a imagem impressa.',
  'ui.aboutDims': 'Implantação 14,005 × 10,501 m · 2,60 m de pé-direito nos dois pisos',
  'ui.aboutLevels': 'Cave à cota −1,61 · rés-do-chão a +1,54 · platibanda a +4,99',
  'ui.aboutWalls': 'Paredes exteriores 0,35 m · divisórias 0,10 m',
  'ui.groundLevels': 'Cotas do terreno',
  'ui.groundLevelsIntro':
    'O terreno é reconstituído a partir das cotas dimensionadas nos cortes e nos alçados:',
  'ui.aboutNote':
    'As peças desenhadas não trazem norte, pelo que o sol fica a um ângulo fixo, escolhido ' +
    'para ler a volumetria e não uma orientação real. O modelo não guarda qualquer informação ' +
    'de localização — sem morada, sem ruas, sem coordenadas — e o contorno do lote é guardado ' +
    'apenas como afastamentos ao canto da própria casa.',
  'ui.close': 'Fechar',

  'ui.designIdeas': 'Ideias de decoração',
  'ui.designIdeasNote':
    'Ambientes retirados das imagens de referência, sobrepostos à geometria desenhada.',
  'ui.street': 'Rua e portões',
  'ui.arrival': 'Ver o carro chegar',
  'ui.arrivalStop': 'Parar',
  'ui.people': 'Percorrer como',
  'ui.peopleNone': 'Ninguém',
  'ui.gateVehicle': 'Portão automóvel',
  'ui.gatePedestrian': 'Portão de peões',
  'ui.garageDoor': 'Portão da garagem',
}

// ─────────────────────────────────────────────────────────────────────────────
// Current language
// ─────────────────────────────────────────────────────────────────────────────

let current: Lang = 'en'
const listeners: Array<(l: Lang) => void> = []

/** Accepts full BCP-47 tags, so `pt-PT`, `pt-BR` and `en-GB` all land somewhere sensible. */
function normalise(tag: string | null | undefined): Lang | null {
  const two = tag?.slice(0, 2).toLowerCase()
  return two === 'pt' || two === 'en' ? two : null
}

function stored(): Lang | null {
  try {
    return normalise(localStorage.getItem(STORE_KEY))
  } catch {
    // Storage can be blocked outright (private windows, embedded frames). Not worth reporting:
    // the language simply will not be remembered.
    return null
  }
}

function preferred(): Lang | null {
  for (const tag of navigator.languages ?? [navigator.language]) {
    const l = normalise(tag)
    if (l) return l
  }
  return null
}

/**
 * Resolve the starting language: an explicit request wins, then a stored choice, then the
 * browser's own preference, then English.
 *
 * A language passed in from the URL is deliberately not written back to storage — a shared link
 * is one view, not a change of preference. Only the picker persists.
 */
export function initLang(fromUrl?: string | null): Lang {
  current = normalise(fromUrl) ?? stored() ?? preferred() ?? 'en'
  document.documentElement.lang = current
  return current
}

export function lang(): Lang {
  return current
}

export function setLang(l: Lang): void {
  current = l
  try {
    localStorage.setItem(STORE_KEY, l)
  } catch {
    // See `stored()`: a blocked write costs nothing but the memory of the choice.
  }
  document.documentElement.lang = l
  for (const fn of listeners) fn(l)
}

export function onLangChange(fn: (l: Lang) => void): void {
  listeners.push(fn)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lookups
// ─────────────────────────────────────────────────────────────────────────────

/** An empty or missing Portuguese string falls back to English rather than blanking the UI. */
export function t(key: Key): string {
  return (current === 'pt' && PT[key]) || EN[key]
}

const isKey = (k: string | undefined): k is Key => k !== undefined && k in EN

/**
 * Translate the static markup in place: `data-i18n` sets textContent, and `data-i18n-attr`
 * takes space-separated `attribute:key` pairs, as in `aria-label:ui.about title:ui.about`.
 * Unknown keys are left alone so the markup keeps whatever it was authored with.
 */
export function applyStatic(root: ParentNode = document): void {
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n
    if (isKey(key)) el.textContent = t(key)
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-i18n-attr]')) {
    for (const pair of (el.dataset.i18nAttr ?? '').split(/\s+/)) {
      const [attr, key] = pair.split(':')
      if (attr && isKey(key)) el.setAttribute(attr, t(key))
    }
  }
}

/** Keyed by the English source text that lives in the data files; anything absent stays as-is. */
type Dict = Record<string, string | undefined>

const PT_ROOMS: Dict = {
  'Living room': 'Sala',
  Bedroom: 'Quarto',
  // The drawings abbreviate to "I.s." and "Vest."; spelled out here because the panel has room.
  Bathroom: 'Casa de banho',
  'Dressing room': 'Vestiário',
  Kitchen: 'Cozinha',
  'Entrance hall': 'Átrio',
  Corridor: 'Corredor',
  Garage: 'Garagem',
  Laundry: 'Lavandaria',
}

export function tRoom(englishName: string): string {
  return (current === 'pt' && PT_ROOMS[englishName]) || englishName
}

const PT_SCHEDULE: Dict = {
  'Plot area': 'Área do lote',
  Footprint: 'Área de implantação',
  'Total floor area': 'Área bruta de construção',
  'Living area': 'Área habitável',
  'Parking area': 'Área de estacionamento',
  'Floor-area ratio': 'Índice de construção',
  'Site coverage': 'Índice de ocupação',
}

export function tSchedule(englishLabel: string): string {
  return (current === 'pt' && PT_SCHEDULE[englishLabel]) || englishLabel
}

const PT_SPOTS: Dict = {
  'street, 10.6 m in front of the house': 'rua, 10,6 m em frente da casa',
  'footpath outside the front boundary': 'passeio fora do limite frontal',
  'paving inside the front boundary': 'pavimento dentro do limite frontal',
  'front terrace': 'terraço frontal',
  'entrance platform': 'patamar de entrada',
  'head of the garage ramp': 'topo da rampa da garagem',
  'left flank, mid-depth': 'lateral esquerda, a meio da profundidade',
  'right flank, mid-depth': 'lateral direita, a meio da profundidade',
  'rear yard': 'logradouro posterior',
  'rear plot boundary': 'limite posterior do lote',
}

export function tSpot(englishNote: string): string {
  return (current === 'pt' && PT_SPOTS[englishNote]) || englishNote
}

interface SchemeText {
  name: string
  note: string
}

const EN_SCHEMES: Record<string, SchemeText | undefined> = {
  'as-specified': {
    name: 'As specified',
    note: 'The finishes written on the drawings: grey render, white band, grey aluminium frames.',
  },
  'warm-minimal': {
    name: 'Warm white',
    note: 'Off-white render, oak frames, pale stone terraces.',
  },
  'dark-contrast': {
    name: 'Dark grey',
    note: 'Charcoal render against the white band — the contrast the massing is drawn for.',
  },
  'white-model': {
    name: 'Study model',
    note: 'Everything in plaster white, so you read the shape and nothing else.',
  },
  'design-ideas': {
    name: 'Design ideas',
    note: 'Cream render, anthracite frames and timber slats — the look in the reference renders.',
  },
}

const PT_SCHEMES: Record<string, SchemeText | undefined> = {
  'as-specified': {
    name: 'Como especificado',
    note:
      'Os acabamentos escritos nas peças desenhadas: monomassa cinza, pala branca e ' +
      'caixilharia de alumínio cinza.',
  },
  'warm-minimal': {
    name: 'Branco quente',
    note: 'Reboco branco-sujo, caixilharia em carvalho, terraços em pedra clara.',
  },
  'dark-contrast': {
    name: 'Cinza escuro',
    note: 'Monomassa antracite contra a pala branca — o contraste para que a volumetria é desenhada.',
  },
  'white-model': {
    name: 'Maqueta de estudo',
    note: 'Tudo em branco de gesso, para se ler a forma e mais nada.',
  },
  'design-ideas': {
    name: 'Ideias de decoração',
    note: 'Monomassa creme, caixilharia antracite e ripado de madeira — o ar das imagens de referência.',
  },
}

/**
 * Scheme name or note by scheme id. `source` is what the data file itself says, used when the
 * id is one this catalogue has never heard of — a scheme added to `finishes.ts` still shows
 * its own English text instead of a gap.
 */
export function tScheme(id: string, field: 'name' | 'note', source?: string): string {
  const local = current === 'pt' ? PT_SCHEMES[id]?.[field] : undefined
  return local || EN_SCHEMES[id]?.[field] || source || id
}

export function tLevel(level: 'cave' | 'ground'): string {
  return t(level === 'cave' ? 'ui.levelCave' : 'ui.levelGround')
}

/**
 * Numbers as the data files print them, re-punctuated for Portuguese. Only a dot standing
 * between two digits is a decimal point, which leaves '1:100', 'm²/m²' and the separators in
 * '14.0 / 12.4 m²' alone.
 */
export function tNumber(text: string): string {
  return current === 'pt' ? text.replace(/(\d)\.(\d)/g, '$1,$2') : text
}

/** The room-list tooltip: the word on the drawing, the printed area, what the model measures. */
export function tRoomTip(original: string, printedArea: string, modelArea: number): string {
  return t('ui.roomTip')
    .replace('{original}', original)
    .replace('{area}', tNumber(printedArea))
    .replace('{model}', tNumber(modelArea.toFixed(1)))
}
