/**
 * Turns a `Scheme` into three.js materials, and swaps them in place when the scheme changes.
 *
 * Materials are shared per surface id, so re-skinning the house is one pass over a map rather
 * than a walk of the scene graph.
 */

import * as THREE from 'three'
import type { Finish, Scheme, SurfaceId } from '../model/finishes'

const textureCache = new Map<string, THREE.Texture>()

/**
 * Small procedural textures. Everything is generated in a canvas so the build has no binary
 * assets to ship and nothing to load over the network.
 */
function grainTexture(kind: NonNullable<Finish['grain']>): THREE.Texture | null {
  if (kind === 'none') return null
  const cached = textureCache.get(kind)
  if (cached) return cached

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, size, size)

  const noise = (amount: number, scale: number) => {
    const img = ctx.getImageData(0, 0, size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount * 255
      img.data[i] += n
      img.data[i + 1] += n
      img.data[i + 2] += n
    }
    ctx.putImageData(img, 0, 0)
    if (scale > 1) {
      // Cheap blur: draw the canvas back onto itself at a smaller scale and up again.
      ctx.globalAlpha = 0.5
      ctx.drawImage(canvas, -scale, 0)
      ctx.drawImage(canvas, scale, 0)
      ctx.drawImage(canvas, 0, -scale)
      ctx.drawImage(canvas, 0, scale)
      ctx.globalAlpha = 1
    }
  }

  switch (kind) {
    case 'render':
      noise(0.08, 2)
      break
    case 'concrete':
      noise(0.12, 3)
      break
    case 'gravel':
      for (let i = 0; i < 4500; i++) {
        const r = 1 + Math.random() * 2.4
        const g = 110 + Math.random() * 80
        ctx.fillStyle = `rgb(${g},${g - 4},${g - 12})`
        ctx.beginPath()
        ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'wood':
      // Board-to-board variation only — enough to read as boards, not enough to stripe.
      for (let y = 0; y < size; y += 16) {
        const v = 124 + Math.random() * 9
        ctx.fillStyle = `rgb(${v},${v},${v})`
        ctx.fillRect(0, y, size, 15)
        ctx.fillStyle = 'rgba(96,96,96,0.35)'
        ctx.fillRect(0, y + 15, size, 1)
      }
      noise(0.03, 1)
      break
    case 'tile':
      ctx.fillStyle = '#8a8a8a'
      ctx.fillRect(0, 0, size, size)
      ctx.strokeStyle = '#7b7b7b'
      ctx.lineWidth = 1.5
      for (let i = 0; i <= size; i += 64) {
        ctx.beginPath()
        ctx.moveTo(i, 0)
        ctx.lineTo(i, size)
        ctx.moveTo(0, i)
        ctx.lineTo(size, i)
        ctx.stroke()
      }
      break
    case 'grass':
      for (let i = 0; i < 9000; i++) {
        const g = 96 + Math.random() * 70
        ctx.fillStyle = `rgb(${g - 10},${g},${g - 30})`
        ctx.fillRect(Math.random() * size, Math.random() * size, 2, 3)
      }
      break
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  textureCache.set(kind, tex)
  return tex
}

const REPEAT: Partial<Record<NonNullable<Finish['grain']>, number>> = {
  render: 1.4,
  concrete: 1.2,
  gravel: 2.2,
  wood: 2.4,
  tile: 1.2,
  grass: 0.35,
}

export class MaterialLibrary {
  private readonly materials = new Map<SurfaceId, THREE.MeshStandardMaterial>()
  private scheme: Scheme

  constructor(scheme: Scheme) {
    this.scheme = scheme
    for (const id of Object.keys(scheme.surfaces) as SurfaceId[]) {
      this.materials.set(id, this.create(id, scheme.surfaces[id]))
    }
  }

  private create(id: SurfaceId, finish: Finish): THREE.MeshStandardMaterial {
    const transparent = finish.opacity !== undefined && finish.opacity < 1
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(finish.color),
      roughness: finish.roughness,
      metalness: finish.metalness,
      transparent,
      opacity: finish.opacity ?? 1,
      side: id === 'glass' ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: !transparent,
    })
    mat.name = id
    this.applyGrain(mat, finish)
    return mat
  }

  private applyGrain(mat: THREE.MeshStandardMaterial, finish: Finish) {
    const tex = finish.grain ? grainTexture(finish.grain) : null
    if (tex) {
      const r = REPEAT[finish.grain!] ?? 1
      const t = tex.clone()
      t.needsUpdate = true
      t.repeat.set(r, r)
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      mat.map = t
    } else {
      mat.map = null
    }
    mat.needsUpdate = true
  }

  get(id: SurfaceId): THREE.MeshStandardMaterial {
    const m = this.materials.get(id)
    if (!m) throw new Error(`unknown surface: ${id}`)
    return m
  }

  get current(): Scheme {
    return this.scheme
  }

  /** Re-skin every surface in place. Meshes keep their material references. */
  apply(scheme: Scheme) {
    this.scheme = scheme
    for (const id of Object.keys(scheme.surfaces) as SurfaceId[]) {
      const finish = scheme.surfaces[id]
      const mat = this.materials.get(id)
      if (!mat) continue
      mat.color.set(finish.color)
      mat.roughness = finish.roughness
      mat.metalness = finish.metalness
      const transparent = finish.opacity !== undefined && finish.opacity < 1
      mat.transparent = transparent
      mat.opacity = finish.opacity ?? 1
      mat.depthWrite = !transparent
      this.applyGrain(mat, finish)
    }
  }
}
