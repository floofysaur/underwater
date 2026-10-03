import type { SpriteDef } from './sprites.js'
import { frameToScreen, type Layout } from './layout.js'
import { pointer } from './pointer.js'

// Fish behaviour. Each fish has a heading (yaw: 0 right, π left; pitch up/down) that can
// only change at a limited, eased turn rate, and a speed that eases up and down, so paths
// are smooth curves. Steering forces (wander, schooling, the cursor, the edges) only pick
// where it would like to go. The drawing itself stays flat and 2D (see fishRenderer).

const TAU = Math.PI * 2
const DEPTH_PX = 420 // css px of travel toward/away from the viewer per unit of z

export type Fish = {
  def: SpriteDef
  seed: number
  x: number
  y: number
  z: number // −1 far … 1 near
  z0: number // home depth, from the painting's layering
  yaw: number // 0 heading right, ±π heading left
  yawVel: number
  pitch: number // + nose down
  pitchVel: number
  speed: number
  vx: number
  vy: number
  side: 1 | -1 // which way it wants to face
  sideTimer: number // seconds since it last decided to turn around
  steerX: number // smoothed steering desire
  steerY: number
  driftX: number // smoothed push from the water (currents, cursor wakes)
  driftY: number
  wander: number
  phase: number // tail-beat phase
  finPhase: number
  tailRate: number // eased tail-beat rate (Hz), so the stroke never changes tempo abruptly
  panic: number
  excite: number
  turnLock: number // seconds a click-triggered turn keeps its new heading
  offscreen: number // seconds spent off the edge of the window
  away: boolean // fully off-screen right now
  visitSince: number // ms timestamp it came back on screen (0 = not a visitor)
  hit: Uint8Array // coarse filled silhouette for click hit-testing
  hitW: number
  hitH: number
}

export function createFish(def: SpriteDef, l: Layout, index: number, hit: { mask: Uint8Array; w: number; h: number }): Fish {
  const p = frameToScreen(l, def.cx, def.cy)
  const s = def.motion.cruise * l.scale
  const yaw = def.facing > 0 ? 0 : Math.PI
  return {
    def,
    seed: index * 2.399 + 0.7,
    x: p.x,
    y: p.y,
    z: (def.depth - 0.5) * 2.4,
    z0: (def.depth - 0.5) * 2.4,
    yaw,
    yawVel: 0,
    pitch: def.pitch,
    pitchVel: 0,
    speed: s,
    vx: Math.cos(yaw) * s,
    vy: Math.sin(def.pitch) * s,
    side: def.facing,
    sideTimer: 10,
    steerX: def.facing,
    steerY: 0,
    driftX: 0,
    driftY: 0,
    wander: def.facing > 0 ? def.pitch : Math.PI - def.pitch,
    phase: Math.random() * TAU,
    finPhase: Math.random() * TAU,
    tailRate: def.motion.tailHz,
    panic: 0,
    excite: 0,
    turnLock: 0,
    offscreen: 0,
    away: false,
    visitSince: 0,
    hit: hit.mask,
    hitW: hit.w,
    hitH: hit.h,
  }
}

/** A touch of 2.5D: fish a little nearer than their spot in the painting read slightly larger. */
export function depthScale(f: Fish) {
  return 1 + (f.z - f.z0) * 0.04
}

/**
 * Horizontal scale for the flat drawing: turning around, the fish narrows as it swings
 * edge-on and widens again facing the other way, following the heading smoothly.
 */
export function flipScale(f: Fish) {
  const c = Math.cos(f.yaw) * f.def.facing
  return Math.sign(c || 1) * Math.max(0.08, Math.pow(Math.abs(c), 0.75))
}



/** Screen size of a fish sprite (before depth scaling). */
export function fishSize(f: Fish, l: Layout) {
  return { w: f.def.w * l.scale, h: f.def.h * l.scale }
}

function angleDiff(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b))
}

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt)

export type FlowFn = (x: number, y: number) => { vx: number; vy: number }

export function stepFish(fishes: Fish[], l: Layout, dt: number, now: number, flow: FlowFn) {
  const t = now / 1000
  const S = l.scale

  const schools = new Map<string, { x: number; y: number; vx: number; vy: number; n: number }>()
  for (const f of fishes) {
    const k = f.def.school
    if (!k) continue
    const g = schools.get(k) ?? { x: 0, y: 0, vx: 0, vy: 0, n: 0 }
    g.x += f.x
    g.y += f.y
    g.vx += f.vx
    g.vy += f.vy
    g.n++
    schools.set(k, g)
  }

  for (const f of fishes) {
    const m = f.def.motion
    const { w, h } = fishSize(f, l)
    const cruise = m.cruise * S

    // ---- where would it like to go? ------------------------------------------------
    const turn =
      Math.sin(t * 0.21 + f.seed * 1.7) * 0.8 +
      Math.sin(t * 0.53 + f.seed * 3.1) * 0.35 +
      Math.sin(t * 0.087 + f.seed * 0.6) * 0.7
    f.wander += turn * 0.35 * dt
    if (f.turnLock <= 0) f.wander += angleDiff(Math.atan2(f.vy, f.vx), f.wander) * ease(0.35, dt)
    f.turnLock = Math.max(0, f.turnLock - dt)
    let dx = Math.cos(f.wander)
    let dy = Math.sin(f.wander) * 0.4

    // Edges: fish may wander right off the sides and come back; the soft walls sit
    // beyond the window, so the turn often happens out of sight.
    const band = Math.max(110, 240 * S)
    const left = -w * 0.75
    const right = l.width + w * 0.75
    const top = Math.max(70 * S, 40) + h * 0.3
    const bottom = l.height - h * 0.3
    const wall = (d: number, b: number) => (d < b ? Math.pow((b - Math.max(d, 0)) / b, 2) * 2.5 : 0)
    dx += wall(f.x - left, band) - wall(right - f.x, band)
    dy += wall(f.y - top, band * 0.7) - wall(bottom - f.y, band * 0.7)
    const out = f.x < -w * 0.4 || f.x > l.width + w * 0.4
    f.offscreen = out ? f.offscreen + dt : 0
    if (f.offscreen > 0) {
      // The longer it's been away, the more it wants to come back.
      const k = Math.min(1.5, f.offscreen / 2.5)
      dx += (f.x < 0 ? 1 : -1) * k
    }

    // Schooling.
    const sk = f.def.school
    if (sk) {
      const g = schools.get(sk)!
      if (g.n > 1) {
        const cx = (g.x - f.x) / (g.n - 1)
        const cy = (g.y - f.y) / (g.n - 1)
        const ax = (g.vx - f.vx) / (g.n - 1)
        const ay = (g.vy - f.vy) / (g.n - 1)
        const cd = Math.hypot(cx - f.x, cy - f.y) || 1
        const pull = Math.min(1, cd / (150 * S)) * 1.2
        dx += ((cx - f.x) / cd) * pull
        dy += ((cy - f.y) / cd) * pull
        const al = Math.hypot(ax, ay) || 1
        dx += (ax / al) * 0.7
        dy += (ay / al) * 0.7
      }
    }
    for (const o of fishes) {
      if (o === f) continue
      const ox = f.x - o.x
      const oy = f.y - o.y
      const d = Math.hypot(ox, oy)
      const same = sk && o.def.school === sk
      // Keep clear of other fish at a similar depth.
      const near = 1 - Math.min(1, Math.abs(f.z - o.z) / 0.8)
      const r = same ? Math.max(w, 30 * S) * 1.1 : Math.max(w, o.def.w * S) * 0.7 + 30 * S
      if (d > 0.001 && d < r) {
        const k = (1 - d / r) * (same ? 1.4 : 0.6 + 0.9 * near)
        dx += (ox / d) * k
        dy += (oy / d) * k
      }
    }

    // Cursor: hover repels, press-and-hold calls them over.
    let threat = 0
    let called = 0
    if (pointer.repel > 0.01 || pointer.attract > 0.01) {
      const ox = f.x - pointer.x
      const oy = f.y - pointer.y
      const d = Math.hypot(ox, oy) || 1
      const reach = Math.max(w, h) * 0.5
      if (pointer.repel > 0.01 && f.turnLock <= 0) {
        const R = Math.max(140, 210 * S) + reach
        if (d < R) {
          const k = Math.pow(1 - d / R, 1.5) * pointer.repel
          dx += (ox / d) * k * 5
          dy += (oy / d) * k * 5
          threat = Math.max(threat, Math.min(1, k * 1.8))
        }
      }
      if (pointer.attract > 0.01) {
        const ring = reach + 50 * S
        const toward = (d - ring) / Math.max(ring, 1)
        const k = pointer.attract
        const radial = Math.max(-1, Math.min(1.6, toward)) * 2.4
        dx += (-ox / d) * radial * k
        dy += (-oy / d) * radial * k
        called = k
      }
    }
    f.panic = Math.max(f.panic * Math.exp(-dt * 1.0), threat)
    f.excite += (Math.max(called * 0.5, f.panic) - f.excite) * ease(2.5, dt)

    // ---- steer a real body toward it -------------------------------------------------
    // Graceful fish don't react to every nudge: the steering desire is smoothed, and a
    // calm fish commits to a direction for a while before it considers turning back.
    f.steerX += (dx - f.steerX) * ease(1.6 + f.panic * 3, dt)
    f.steerY += (dy - f.steerY) * ease(1.6 + f.panic * 3, dt)
    f.sideTimer += dt
    if (f.turnLock <= 0) {
      const eager = f.panic > 0.3 || called > 0.3
      const threshold = eager ? 0.25 : 0.55
      const settled = eager || f.sideTimer > 2.5
      if (settled && f.side < 0 && f.steerX > threshold) {
        f.side = 1
        f.sideTimer = 0
      } else if (settled && f.side > 0 && f.steerX < -threshold) {
        f.side = -1
        f.sideTimer = 0
      }
    }
    // Drift a little toward / away from the viewer, and back to mid-depth.
    const yawOff = m.wanderYaw * Math.sin(t * 0.19 + f.seed * 2.1) - (f.z - f.z0) * 0.6
    const wantYaw = f.side > 0 ? yawOff : Math.PI - yawOff
    const wantPitch = Math.max(-m.maxPitch, Math.min(m.maxPitch, Math.atan2(f.steerY, Math.abs(f.steerX) + 0.45)))

    const urgency = 1 + f.panic * 1.2 + called * 0.4 + (f.turnLock > 0 ? 0.6 : 0)
    const maxTurn = m.maxTurn * urgency
    const yawTarget = Math.max(-maxTurn, Math.min(maxTurn, angleDiff(wantYaw, f.yaw) * 1.6))
    f.yawVel += (yawTarget - f.yawVel) * ease(m.turnAccel * urgency, dt)
    f.yaw = angleDiff(f.yaw + f.yawVel * dt, 0)
    const pitchTarget = Math.max(-maxTurn, Math.min(maxTurn, (wantPitch - f.pitch) * 1.5))
    f.pitchVel += (pitchTarget - f.pitchVel) * ease(m.turnAccel * 0.6 * urgency, dt)
    f.pitch += f.pitchVel * dt

    const burst = 1 + 0.12 * Math.pow(Math.max(0, Math.sin(t * 0.5 + f.seed * 2.3)), 6)
    const dart = f.turnLock > 0 ? cruise * 1.2 * Math.min(1, f.turnLock / 0.6) : 0
    const desired = cruise * burst + (m.fleeSpeed * S - cruise) * f.panic + cruise * 1.3 * called + dart
    f.speed += (desired - f.speed) * ease(m.speedEase * (1 + f.panic * 1.2), dt)

    // A turning fish eases off a little.
    const turning = Math.min(1, Math.abs(f.yawVel) / Math.max(m.maxTurn, 0.01))
    // The stroke tempo follows speed, but eases slowly so the tail never stutters.
    const wantRate = m.tailHz * (0.7 + 0.3 * Math.min(2.5, f.speed / Math.max(cruise, 1))) * (1 + turning * 0.15)
    f.tailRate += (wantRate - f.tailRate) * ease(0.8, dt)
    f.phase += TAU * f.tailRate * dt
    f.finPhase += TAU * m.finSpeed * dt
    const v = f.speed * (1 - turning * 0.25)

    f.vx = v * Math.cos(f.pitch) * Math.cos(f.yaw)
    f.vy = v * Math.sin(f.pitch)
    const vz = v * Math.cos(f.pitch) * Math.sin(f.yaw)

    // Water pushes are smoothed so a sudden wake carries the fish rather than jolting it.
    const c = flow(f.x, f.y)
    f.driftX += (c.vx - f.driftX) * ease(1.4, dt)
    f.driftY += (c.vy - f.driftY) * ease(1.4, dt)
    f.x += (f.vx + f.driftX) * dt
    f.y += (f.vy + f.driftY) * dt
    f.z = Math.max(-1.8, Math.min(1.8, f.z + (vz / (DEPTH_PX * Math.max(S, 0.5))) * dt))
    f.x = Math.min(l.width + w * 1.6, Math.max(-w * 1.6, f.x))
    f.y = Math.min(l.height + h, Math.max(-h, f.y))

    // Visitors: every fish in view. Fish on screen when the page opens count from the
    // start; one that swims off drops out, and rejoins (at the end) when it comes back.
    if (f.x < -w * 0.5 || f.x > l.width + w * 0.5) {
      f.away = true
      f.visitSince = 0
    } else if (!f.visitSince && f.x > 0 && f.x < l.width) {
      f.away = false
      f.visitSince = Math.max(now, 1)
    }
  }
}

/** Turn a fish around (click): it swings its body through depth and darts off. */
export function turnAround(f: Fish) {
  f.side = f.side > 0 ? -1 : 1
  f.turnLock = 1.4
  f.wander = f.side > 0 ? (Math.random() - 0.5) * 0.5 : Math.PI + (Math.random() - 0.5) * 0.5
  // Kick the turn off in the direction it's already leaning, like a real flip-turn.
  f.yawVel += Math.sign(Math.sin(f.yaw) || Math.random() - 0.5) * f.def.motion.maxTurn * 0.6
  f.sideTimer = 0
  f.excite = 1
}

/** Hit test against a fish's silhouette via a coarse mask. */
export function hitTest(f: Fish, l: Layout, px: number, py: number) {
  const { w, h } = fishSize(f, l)
  const k = depthScale(f)
  const dx = (px - f.x) / k
  const dy = (py - f.y) / k
  if (dx * dx + dy * dy > (w * w + h * h) * 0.3) return false
  const flip = flipScale(f)
  if (Math.abs(flip) < 0.25) return false
  // Undo the tilt, then the flip.
  const angle = f.pitch * Math.sign(Math.cos(f.yaw) || 1)
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  const lx = (dx * c - dy * s) / flip
  const ly = dx * s + dy * c
  const u = lx / w + 0.5
  const v = ly / h + 0.5
  const pad = Math.max(0, (22 * l.scale) / Math.min(w, h) - 0.1)
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const uu = u + ox * pad * 0.5
      const vv = v + oy * pad * 0.5
      if (uu < 0 || uu >= 1 || vv < 0 || vv >= 1) continue
      if (f.hit[Math.floor(vv * f.hitH) * f.hitW + Math.floor(uu * f.hitW)]) return true
    }
  }
  return false
}

function readAlpha(img: HTMLImageElement, cols: number, rows: number) {
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  const a = new Float32Array(cols * rows)
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]! / 255
  return a
}

/** Coarse, hole-filled silhouette for hit-testing. */
export function buildHitMask(img: HTMLImageElement, cols = 48): { mask: Uint8Array; w: number; h: number } {
  const rows = Math.max(8, Math.round((cols * img.naturalHeight) / img.naturalWidth))
  const a = readAlpha(img, cols, rows)
  const mask = new Uint8Array(cols * rows)
  for (let i = 0; i < mask.length; i++) mask[i] = a[i]! > 0.25 ? 1 : 0
  const outside = new Uint8Array(cols * rows)
  const stack: number[] = []
  for (let x = 0; x < cols; x++) stack.push(x, (rows - 1) * cols + x)
  for (let y = 0; y < rows; y++) stack.push(y * cols, y * cols + cols - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (outside[i] || mask[i]) continue
    outside[i] = 1
    const x = i % cols
    const y = (i / cols) | 0
    if (x > 0) stack.push(i - 1)
    if (x < cols - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - cols)
    if (y < rows - 1) stack.push(i + cols)
  }
  for (let i = 0; i < mask.length; i++) if (!outside[i]) mask[i] = 1
  return { mask, w: cols, h: rows }
}

/** Names of the fish currently in view, in order of arrival (newest last). */
export function visitorNames(fishes: Fish[], max = Infinity): string[] {
  const seen = new Map<string, number>()
  for (const f of fishes) {
    if (!f.visitSince) continue
    const prev = seen.get(f.def.name)
    if (prev === undefined || f.visitSince < prev) seen.set(f.def.name, f.visitSince)
  }
  return [...seen.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name)
    .slice(-max)
}
