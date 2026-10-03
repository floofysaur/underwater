import { useEffect, useRef } from 'react'

// Film grain that "buzzes": a fine, device-pixel noise tile laid over the whole scene
// with an overlay blend, re-positioned at random about 24 times a second so the grain
// shimmers like the reference clip instead of sitting still.

const TILE = 256
let cached: string | null = null

function grainTile() {
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(TILE, TILE)
  for (let i = 0; i < TILE * TILE; i++) {
    // Slightly soft distribution: most pixels near mid-grey, a few brighter/darker.
    const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 150
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  cached = c.toDataURL('image/png')
  return cached
}

export function Grain() {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    el.style.backgroundImage = `url(${grainTile()})`
    // One grain per device pixel.
    el.style.backgroundSize = `${TILE / dpr}px ${TILE / dpr}px`
    if (reduce) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 1000 / 24) return
      last = now
      const x = Math.floor(Math.random() * TILE) / dpr
      const y = Math.floor(Math.random() * TILE) / dpr
      el.style.backgroundPosition = `${x}px ${y}px`
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
        mixBlendMode: 'overlay',
        opacity: 0.16,
      }}
    />
  )
}
