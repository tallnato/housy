# housy

An interactive 3D model of a two-storey house, built directly from its architectural drawings
and published as a static site.

**→ Live: https://tallnato.github.io/housy/**

![The house and its plot](docs/preview.png)

<!-- prettier-ignore -->
> The drawings themselves are not in this repository, and neither is anything that would locate
> the house. See [Privacy](#privacy).

---

## What it does

- **Walk around it.** Orbit the model, or drop into a first-person walkthrough and go inside.
  The walker raycasts the real geometry, so the stairs work as stairs and the walls stop you.
- **Peel it apart.** Show the basement, the ground floor, or both; hide the roof; hide the site.
- **Move the sun.** Azimuth and altitude sliders, with real shadows.
- **Try finishes.** Switch the whole house between material schemes.
- **See the design ideas.** A second layer, from the owner's reference renders rather than
  from the drawings: furniture, timber slat cladding, an eaves cove light, glass Juliet
  balustrades, a sectional garage door and a planted garden. One checkbox turns it off and
  leaves the drawn house standing.
- **Read it.** Room names and areas float over the model, and the drawing's area schedule is
  in the panel.
- **In two languages.** The house is Portuguese and so are its drawings; the interface reads
  in Portuguese or English, and `?lang=pt` carries the choice in a link.

Pick a floor and the roof and everything above it peels away:

![Ground floor with the roof off](docs/plan.png)

…or walk in. The living room's rear wall is a 4.15 m sliding screen running floor to lintel:

![Inside the living room](docs/interior.png)

## The model is data, not a mesh

There is no `.glb` here and nothing was modelled by hand. `src/model/house.ts` is a declarative
description of the building — levels, walls, openings, rooms — and `src/scene/builder.ts` turns
it into geometry at load time. Change a number, reload, see it.

```ts
// src/model/house.ts
{
  id: 'g-rear',
  run: 'x', at: 0.175, from: 0, to: SIZE.width,
  thickness: SIZE.wallExt, exterior: true,
  openings: [
    french(1.002, 5.153, 'Sala — glazed wall'),
    french(6.203, 8.203, 'Quarto'),
    french(11.004, 13.004, 'Quarto'),
  ],
}
```

Walls with openings are emitted as the piers, lintels and spandrels that are actually left
standing, so a reveal has real depth and there is no CSG in the pipeline.

### Where the numbers came from

The dimensions were read out of the **vector geometry inside the PDF drawing set**, not traced
off pixels. The drawings' scale was confirmed as exactly 1:100 (1 pt = 35.2778 mm) by measuring
the roof outline against its printed 14.00 × 10.50 m dimension, and every level was
cross-checked against the sections — the basement floor at −1.61, the datum line at −2.62 and
the 3.15 m floor-to-floor all close to the millimetre.

| | |
|---|---|
| Footprint | 14.005 × 10.501 m (147 m²) |
| Floor-to-floor | 3.150 m · clear height 2.60 m on both floors |
| Levels | basement −1.61 · ground floor +1.54 · parapet +4.99 |
| Walls | 0.35 m external · 0.10 m partitions |
| Accommodation | 3 bedrooms + suite, 2 bathrooms, living room, kitchen; garage, laundry and wc below |

## Coordinates

Plan coordinates in metres, exactly as the plans are drawn:

```
        x = 0 ............................. x = 14.005
   y = 0   ┌─────────────────────────────┐   ← rear façade   (alçado posterior)
           │                             │
  y = 10.5 └─────────────────────────────┘   ← front façade  (alçado principal, the street)
```

The renderer maps plan `(x, y)` → world `(x, z)` and elevation → world `y`, so **+Y is up and
+Z faces the street**.

## Linking to a view

The viewer keeps its state in the URL, so any view is a link you can send someone.

| Parameter | Values | |
|---|---|---|
| `view` | `axo` `principal` `posterior` `esquerdo` `direito` `topo` | viewpoint |
| `floor` | `cave` `ground` | isolate one floor |
| `roof` | `0` | take the roof off |
| `scheme` | `as-specified` `design-ideas` `warm-minimal` `dark-contrast` `white-model` | finishes |
| `design` | `0` | take the design layer off |
| `ui` | `0` | hide the chrome, for embedding |
| `lang` | `en` `pt` | interface language |
| `labels` | `0` | hide the room names |
| `cam` / `at` | `x,y,z` | place the camera and its target exactly |

```
https://tallnato.github.io/housy/?view=topo&floor=cave&roof=0
```

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/
npm run typecheck
```

Deploys itself: pushing to `main` runs `.github/workflows/deploy.yml`, which builds with
`BASE_PATH=/housy/` and publishes `dist/` to GitHub Pages.

## Layout

```
src/
  i18n.ts         the interface in English and Portuguese
  model/
    house.ts      the building as data — levels, walls, openings, rooms
    site.ts       plot outline and the ground surface (relative coordinates only)
    finishes.ts   material schemes; add new ones here
  scene/
    builder.ts    data → three.js geometry
    exterior.ts   slat cladding, cove light, balustrades, the sectional garage door
    furniture.ts  the interiors from the reference renders
    planting.ts   hedges, shrubs and trees
    materials.ts  schemes → materials, incl. small procedural textures
    viewer.ts     renderer, camera, sun, orbit + walk controls
  main.ts         UI wiring
```

## The design layer

The drawings say what the house *is*. A separate set of reference renders says what it might
look like finished, and everything taken from those lives behind the **Design ideas** switch:
`scene/furniture.ts` fits out the rooms, `scene/exterior.ts` adds the timber slats, the eaves
cove and the Juliet balustrades, `scene/planting.ts` puts in the garden, and the `design-ideas`
scheme in `model/finishes.ts` carries the palette — cream render under a dark band, anthracite
frames, pale oak and charcoal inside.

It is all procedural, like everything else here: no imported models, no textures on disk. The
reference images themselves are not in this repository, for the same reason the drawings are
not.

## Adding a finish scheme

Copy one of the objects in `src/model/finishes.ts`, change the colours, and it appears in the
panel. Every visible surface belongs to one of a fixed set of ids (`exteriorWall`, `pala`,
`frame`, `glass`, `roof`, …), so a scheme is just a map from id to material.

```ts
export const MY_SCHEME: Scheme = {
  id: 'my-scheme',
  name: 'Something I saw',
  note: 'Where the look came from.',
  image: 'inspiration/kitchen-01.jpg', // optional, from public/
  surfaces: {
    ...AS_SPECIFIED.surfaces,
    exteriorWall: { color: '#e8e4dc', roughness: 0.9, metalness: 0, grain: 'render' },
  },
}
```

Then add it to `SCHEMES`. That is the whole extension point — the planned next step is to drop
reference images into `public/inspiration/` and let the picker show them alongside each scheme.

## Privacy

This repository is public, so it deliberately contains **no location and no personal data**:

- The source PDFs and the georeferenced DWG are **git-ignored** and never committed.
- No address, street, parish, municipality, land-registry reference or map coordinate appears
  anywhere in the code or the UI.
- No owner, architect or certificate details.
- The plot outline in `src/model/site.ts` is stored purely as **offsets from the house's own
  corner** — a shape, with nothing to pin it to a map. Neighbouring buildings and the road are
  not modelled at all.
- The drawings give no north point, so the sun direction is a free slider rather than a real
  orientation.

If you fork this, keep `*.pdf` and `*.dwg` in `.gitignore`.

## Licence

MIT — see [LICENSE](LICENSE).
