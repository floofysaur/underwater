import { useEffect, useRef } from 'react'
import { loadImage, textureFromImage } from './gl.js'
import { computeLayout, type Layout } from './layout.js'
import { SPRITES } from './sprites.js'
import { buildHitMask, createFish, hitTest, stepFish, turnAround, visitorNames, type Fish } from './fish.js'
import { createFishRenderer } from './fishRenderer.js'
import { createFluid, sampleFluid, splat, stepFluid, swirl, type Fluid } from './fluid.js'
import { createSpeckleRenderer, createSpeckles, stepSpeckles } from './speckles.js'
import { createCurrent, createCurrentRenderer, flowAt, ribbonsOnScreen, stepCurrent } from './current.js'
import { pointer, updatePointer } from './pointer.js'

// Longest frame the simulation will catch up on (e.g. after a hitch). Tests can raise it
// with ?maxdt=… in development, where software rendering runs at a few fps.
const MAX_DT = (() => {
  const q = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('maxdt')) : 0
  return q > 0 ? q : 0.1
})()

/**
 * The living layer of the scene — undercurrent, speckles and fish — drawn with WebGL2
 * on one transparent canvas above the light-ray shader.
 */
export function Aquarium({ onVisitors }: { onVisitors?: (names: string[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const onVisitorsRef = useRef(onVisitors)
  useEffect(() => {
    onVisitorsRef.current = onVisitors
  }, [onVisitors])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: true, alpha: true })
    if (!gl) return

    let disposed = false
    let raf = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let layout: Layout = computeLayout(window.innerWidth, window.innerHeight)
    let fluid: Fluid = createFluid(layout.width, layout.height)

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      const prev = layout
      layout = computeLayout(window.innerWidth, window.innerHeight)
      canvas.width = Math.round(layout.width * dpr)
      canvas.height = Math.round(layout.height * dpr)
      fluid = createFluid(layout.width, layout.height)
      // Keep fish where they were, proportionally.
      if (fishes.length && prev.width > 0) {
        for (const f of fishes) {
          f.x = ((f.x - prev.offsetX) / prev.scale) * layout.scale + layout.offsetX
          f.y = ((f.y - prev.offsetY) / prev.scale) * layout.scale + layout.offsetY
        }
      }
    }

    const fishRenderer = createFishRenderer(gl)
    const speckleRenderer = createSpeckleRenderer(gl)
    const currentRenderer = createCurrentRenderer(gl)
    const textures = new Map<string, WebGLTexture>()
    let fishes: Fish[] = []
    const speckles = createSpeckles(layout)
    const current = createCurrent()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    resize()

    // Load every sprite, then start swimming.
    void Promise.all(
      SPRITES.map(async (def, i) => {
        const img = await loadImage(def.url)
        return { def, i, img }
      }),
    ).then((loaded) => {
      if (disposed) return
      fishes = loaded
        .sort((a, b) => a.def.depth - b.def.depth)
        .map(({ def, i, img }) => {
          textures.set(def.id, textureFromImage(gl, img))
          return createFish(def, layout, i, buildHitMask(img))
        })
      if (import.meta.env.DEV) Object.assign(window, { __fish: fishes, __pointer: pointer, __sim: sim, __fluid: () => fluid, __speckles: speckles })
    })

    // ---- input -------------------------------------------------------------------
    let lastMove = performance.now()
    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      const d = Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y)
      const dt = Math.max(1, now - lastMove) / 1000
      pointer.speed = pointer.speed * 0.7 + (d / dt) * 0.3
      lastMove = now
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.inside = true
    }
    const onDown = (e: PointerEvent) => {
      onMove(e)
      pointer.down = true
      pointer.downAt = performance.now()
      pointer.consumed = false
      // Topmost fish under the pointer turns around.
      for (const f of [...fishes].sort((a, b) => b.z - a.z)) {
        if (hitTest(f, layout, e.clientX, e.clientY)) {
          turnAround(f)
          pointer.consumed = true
          break
        }
      }
    }
    const onUp = (e: PointerEvent) => {
      pointer.down = false
      pointer.consumed = false
      // A lifted finger isn't hovering anywhere.
      if (e.pointerType === 'touch') pointer.inside = false
    }
    const onLeave = () => {
      pointer.inside = false
      pointer.down = false
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.addEventListener('blur', onLeave)
    window.addEventListener('resize', resize)

    // ---- loop --------------------------------------------------------------------
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    let last = performance.now()
    const start = last
    const sim = { time: 0, frames: 0 }
    let lastVisitors = ''
    let lastVisitorCheck = 0
    let prevX = pointer.x
    let prevY = pointer.y

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      let dt = Math.min((now - last) / 1000, MAX_DT)
      last = now
      if (reduceMotion) dt *= 0.4
      sim.time += dt
      sim.frames++
      const time = (now - start) / 1000

      // Fixed-size substeps keep steering stable when frames are slow.
      const steps = Math.max(1, Math.ceil(dt / (1 / 45)))
      const h = dt / steps
      const ribbons = ribbonsOnScreen(layout)
      const S = Math.max(0.6, layout.scale)

      // Stir the water along the path the cursor took since last frame.
      if (pointer.inside && prevX > -9000) {
        const mx = pointer.x - prevX
        const my = pointer.y - prevY
        const dist = Math.hypot(mx, my)
        if (dist > 0.5 && dt > 0) {
          const vscale = Math.min(1, 1600 / (dist / dt)) * 0.55
          const vx = (mx / dt) * vscale
          const vy = (my / dt) * vscale
          const n = Math.min(8, Math.ceil(dist / 24))
          for (let k = 1; k <= n; k++) {
            splat(fluid, prevX + (mx * k) / n, prevY + (my * k) / n, vx / n, vy / n, 46 * S)
          }
        }
      }
      prevX = pointer.inside ? pointer.x : -9999
      prevY = pointer.y
      if (pointer.attract > 0.01) swirl(fluid, pointer.x, pointer.y, 140 * S * pointer.attract * dt, 110 * S)

      for (let k = 0; k < steps; k++) {
        const simNow = now - (steps - 1 - k) * h * 1000
        updatePointer(h, simNow)
        stepCurrent(current, h)
        stepFluid(fluid, h)
        stepFish(fishes, layout, h, simNow, (x, y) => {
          const c = flowAt(current, ribbons, layout, x, y)
          const w = sampleFluid(fluid, x, y)
          return { vx: c.vx + w.vx * 0.35, vy: c.vy + w.vy * 0.35 }
        })
        stepSpeckles(speckles, layout, h, time - (steps - 1 - k) * h, fluid)
      }

      // Tell the page who's visiting (a few times a second is plenty).
      if (now - lastVisitorCheck > 250) {
        lastVisitorCheck = now
        const names = visitorNames(fishes)
        const key = names.join(',')
        if (key !== lastVisitors) {
          lastVisitors = key
          onVisitorsRef.current?.(names)
        }
      }

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      currentRenderer.draw(layout, dpr, time, current)
      speckleRenderer.draw(layout, dpr, time, speckles, current, 'back')
      fishRenderer.draw(layout, time, fishes, textures)
      speckleRenderer.draw(layout, dpr, time, speckles, current, 'front')
    }
    raf = requestAnimationFrame(frame)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      window.removeEventListener('blur', onLeave)
      window.removeEventListener('resize', resize)
      for (const t of textures.values()) gl.deleteTexture(t)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  )
}
