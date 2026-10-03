// A small "stable fluids" solver (Stam) on a coarse grid covering the window. The cursor
// stirs it; speckles and fish drift in it. Because the velocity is advected and made
// divergence-free, a stroke of the cursor leaves a wake that curls into a pair of soft
// eddies and slowly dies away — the way water behaves, rather than things being pushed.

export type Fluid = {
  nx: number
  ny: number
  cell: number // css px per cell
  u: Float32Array
  v: Float32Array
  u0: Float32Array
  v0: Float32Array
  p: Float32Array
  div: Float32Array
  width: number
  height: number
}

export function createFluid(width: number, height: number, cell = 26): Fluid {
  const nx = Math.max(8, Math.ceil(width / cell))
  const ny = Math.max(8, Math.ceil(height / cell))
  const n = nx * ny
  return {
    nx,
    ny,
    cell: width / nx,
    u: new Float32Array(n),
    v: new Float32Array(n),
    u0: new Float32Array(n),
    v0: new Float32Array(n),
    p: new Float32Array(n),
    div: new Float32Array(n),
    width,
    height,
  }
}

function sampleField(f: Fluid, a: Float32Array, gx: number, gy: number) {
  const { nx, ny } = f
  gx = Math.min(nx - 1.001, Math.max(0, gx))
  gy = Math.min(ny - 1.001, Math.max(0, gy))
  const x0 = gx | 0
  const y0 = gy | 0
  const tx = gx - x0
  const ty = gy - y0
  const i = y0 * nx + x0
  return (
    (a[i]! * (1 - tx) + a[i + 1]! * tx) * (1 - ty) +
    (a[i + nx]! * (1 - tx) + a[i + nx + 1]! * tx) * ty
  )
}

/** Fluid velocity at a css-px position, in css px / s. */
export function sampleFluid(f: Fluid, x: number, y: number) {
  const gx = x / f.cell - 0.5
  const gy = y / f.cell - 0.5
  return { vx: sampleField(f, f.u, gx, gy), vy: sampleField(f, f.v, gx, gy) }
}

/** Add velocity (css px/s) in a soft disc of `radius` css px. */
export function splat(f: Fluid, x: number, y: number, vx: number, vy: number, radius: number) {
  const { nx, ny, cell } = f
  const r = radius / cell
  const cx = x / cell - 0.5
  const cy = y / cell - 0.5
  const x0 = Math.max(0, Math.floor(cx - r * 2))
  const x1 = Math.min(nx - 1, Math.ceil(cx + r * 2))
  const y0 = Math.max(0, Math.floor(cy - r * 2))
  const y1 = Math.min(ny - 1, Math.ceil(cy + r * 2))
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i - cx
      const dy = j - cy
      const w = Math.exp(-(dx * dx + dy * dy) / (r * r))
      const k = j * nx + i
      f.u[k] += vx * w
      f.v[k] += vy * w
    }
  }
}

/** A gentle whirlpool around a point (used while the pointer is held down). */
export function swirl(f: Fluid, x: number, y: number, strength: number, radius: number) {
  const { nx, ny, cell } = f
  const r = radius / cell
  const cx = x / cell - 0.5
  const cy = y / cell - 0.5
  const x0 = Math.max(0, Math.floor(cx - r * 2))
  const x1 = Math.min(nx - 1, Math.ceil(cx + r * 2))
  const y0 = Math.max(0, Math.floor(cy - r * 2))
  const y1 = Math.min(ny - 1, Math.ceil(cy + r * 2))
  for (let j = y0; j <= y1; j++) {
    for (let i = x0; i <= x1; i++) {
      const dx = i - cx
      const dy = j - cy
      const d = Math.hypot(dx, dy) + 0.5
      const w = Math.exp(-(d * d) / (r * r)) * Math.min(1, d / (r * 0.35))
      const k = j * nx + i
      f.u[k] += (-dy / d) * strength * w
      f.v[k] += (dx / d) * strength * w
    }
  }
}

export function stepFluid(f: Fluid, dt: number, damping = 0.9) {
  const { nx, ny, cell, u, v, u0, v0, p, div } = f
  // Advect (semi-Lagrangian), in grid units.
  u0.set(u)
  v0.set(v)
  const s = dt / cell
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const px = i - u0[k]! * s
      const py = j - v0[k]! * s
      u[k] = sampleField(f, u0, px, py)
      v[k] = sampleField(f, v0, px, py)
    }
  }
  // Project: remove divergence so the flow swirls instead of piling up.
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i
      div[k] = -0.5 * (u[k + 1]! - u[k - 1]! + v[k + nx]! - v[k - nx]!)
      p[k] = 0
    }
  }
  for (let it = 0; it < 14; it++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i
        p[k] = (div[k]! + p[k - 1]! + p[k + 1]! + p[k - nx]! + p[k + nx]!) / 4
      }
    }
  }
  const decay = Math.exp(-dt * damping)
  for (let j = 1; j < ny - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i
      u[k] = (u[k]! - 0.5 * (p[k + 1]! - p[k - 1]!)) * decay
      v[k] = (v[k]! - 0.5 * (p[k + nx]! - p[k - nx]!)) * decay
    }
  }
  // Walls: no flow through the window edges.
  for (let i = 0; i < nx; i++) {
    u[i] = v[i] = 0
    u[(ny - 1) * nx + i] = v[(ny - 1) * nx + i] = 0
  }
  for (let j = 0; j < ny; j++) {
    u[j * nx] = v[j * nx] = 0
    u[j * nx + nx - 1] = v[j * nx + nx - 1] = 0
  }
}
