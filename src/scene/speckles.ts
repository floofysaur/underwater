import { compile, uniforms } from './gl.js'
import type { Layout } from './layout.js'
import { sampleFluid, type Fluid } from './fluid.js'
import { pointer } from './pointer.js'
import { RIBBONS, ribbonPoint, ribbonsOnScreen, visibilityAt, type CurrentState } from './current.js'

// Glowing speckles. Most are tiny motes drifting on a slow flow field; a handful are
// four-pointed "celestial" glints. The cursor stirs them (they part and swirl around it
// on hover, and are drawn into an orbit while the pointer is held down). A second set
// rides the undercurrent and only exists while it does.

type Speck = {
  x: number
  y: number
  vx: number
  vy: number
  size: number // css px
  color: [number, number, number]
  twinkle: number // phase
  rate: number
  star: number // 0 dot, 1 four-point glint
  glow: number // brightness
  // current riders
  ribbon: number // -1 for ambient
  t: number
  across: number
  pace: number
}

// Sampled from the painting: mint, rose, peach, lavender-grey, pale starlight, teal.
const PALETTE: [number, number, number][] = [
  [0.45, 0.85, 0.66],
  [0.93, 0.5, 0.64],
  [0.96, 0.7, 0.52],
  [0.72, 0.7, 0.95],
  [0.9, 0.94, 1.0],
  [0.45, 0.85, 0.9],
]

// The flecks riding the undercurrent are muted, like the painted dots in the mockup.
const RIDER_PALETTE: [number, number, number][] = [
  [0.32, 0.62, 0.45],
  [0.72, 0.25, 0.36],
  [0.78, 0.48, 0.36],
  [0.52, 0.52, 0.8],
  [0.52, 0.52, 0.8],
]

const AMBIENT = 70
const STARS = 7
const RIDERS = 78

export function createSpeckles(l: Layout): Speck[] {
  const out: Speck[] = []
  const rnd = Math.random
  for (let i = 0; i < AMBIENT + STARS; i++) {
    const star = i >= AMBIENT ? 1 : 0
    out.push({
      x: rnd() * l.width,
      y: rnd() * l.height,
      vx: 0,
      vy: 0,
      size: star ? 9 + rnd() * 7 : 1.1 + Math.pow(rnd(), 2.5) * 2.4,
      color: star ? PALETTE[4]! : PALETTE[Math.floor(rnd() * PALETTE.length)]!,
      twinkle: rnd() * Math.PI * 2,
      rate: star ? 0.25 + rnd() * 0.3 : 0.5 + rnd() * 1.4,
      star,
      glow: star ? 0.75 : 0.35 + rnd() * 0.5,
      ribbon: -1,
      t: 0,
      across: 0,
      pace: 0,
    })
  }
  for (let i = 0; i < RIDERS; i++) {
    out.push({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2.6 + rnd() * 2.8,
      color: RIDER_PALETTE[Math.floor(rnd() * RIDER_PALETTE.length)]!,
      twinkle: rnd() * Math.PI * 2,
      rate: 0.6 + rnd(),
      star: 2, // painted dot
      glow: 0.6 + rnd() * 0.35,
      ribbon: 1 + Math.floor(rnd() * 2),
      t: rnd(),
      across: (rnd() * 2 - 1) * 2.6,
      pace: 0.035 + rnd() * 0.04,
    })
  }
  return out
}

export function stepSpeckles(ps: Speck[], l: Layout, dt: number, time: number, fluid: Fluid) {
  const W = l.width
  const H = l.height
  const S = Math.max(0.6, l.scale)
  const ribbons = ribbonsOnScreen(l)
  // Motes have a little mass: they ease toward the water's velocity instead of snapping
  // to it, so they swirl, overshoot slightly and settle — like silt in water.
  const follow = 1 - Math.exp(-dt * 2.2)
  for (const p of ps) {
    let tx: number
    let ty: number
    if (p.ribbon >= 0) {
      p.t += p.pace * dt
      if (p.t > 1.05) {
        p.t = -0.05
        p.across = (Math.random() * 2 - 1) * 2.6
      }
      const target = ribbonPoint(ribbons[p.ribbon]!, p.t, p.across + Math.sin(time * 0.7 + p.twinkle) * 0.15)
      if (p.x === 0 && p.y === 0) {
        p.x = target.x
        p.y = target.y
      }
      tx = (target.x - p.x) * 1.6
      ty = (target.y - p.y) * 1.6
    } else {
      // Slow ambient drift + a faint upward buoyancy + a little wobble.
      tx = (Math.sin(p.y * 0.004 + time * 0.07 + p.twinkle) * 7 + Math.sin(time * 0.05 + p.x * 0.002) * 4) * S
      ty = (Math.cos(p.x * 0.0035 - time * 0.06) * 5 - 3) * S
      tx += Math.sin(time * 1.3 + p.twinkle * 7) * 3 * S
      ty += Math.cos(time * 1.1 + p.twinkle * 5) * 3 * S
    }

    // The water the cursor stirred.
    const w = sampleFluid(fluid, p.x, p.y)
    const couple = 0.85 + ((p.twinkle * 3.1) % 0.3)
    tx += w.vx * couple
    ty += w.vy * couple

    // A resting cursor gently displaces the water around it.
    const dx = p.x - pointer.x
    const dy = p.y - pointer.y
    const d = Math.hypot(dx, dy) || 1
    const R = 80 * S
    if (pointer.repel > 0.01 && d < R) {
      const k = Math.pow(1 - d / R, 2) * pointer.repel * 34 * S
      tx += (dx / d) * k
      ty += (dy / d) * k
    }
    // Held down: motes are drawn into a slow spiral around the cursor.
    if (pointer.attract > 0.01) {
      const k = pointer.attract * Math.min(1, (320 * S) / d)
      const ring = 50 * S * (0.6 + ((p.twinkle * 1.7) % 1))
      const radial = Math.max(-1, Math.min(1, (d - ring) / (90 * S)))
      tx += (-dx / d) * radial * 55 * S * k
      ty += (-dy / d) * radial * 55 * S * k
    }

    p.vx += (tx - p.vx) * follow
    p.vy += (ty - p.vy) * follow
    p.x += p.vx * dt
    p.y += p.vy * dt
    if (p.ribbon < 0) {
      if (p.x < -20) p.x += W + 40
      if (p.x > W + 20) p.x -= W + 40
      if (p.y < -20) p.y += H + 40
      if (p.y > H + 20) p.y -= H + 40
    }
  }
}

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
layout(location=1) in float aSize;
layout(location=2) in vec4 aColor; // rgb, alpha
layout(location=3) in float aStar;
uniform vec2 uRes;
uniform float uDpr;
out vec4 vColor;
out float vStar;
void main() {
  vec2 clip = aPos / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  // Glow needs room around the core.
  gl_PointSize = aSize * uDpr * (aStar > 1.5 ? 2.0 : aStar > 0.5 ? 2.2 : 5.0);
  vColor = aColor;
  vStar = aStar;
}
`

const FS = `#version 300 es
precision mediump float;
in vec4 vColor;
in float vStar;
out vec4 outColor;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r = length(q);
  float a;
  if (vStar > 1.5) {
    // Painted fleck: a soft-edged dab with just a whisper of glow.
    a = (1.0 - smoothstep(0.5, 0.78, r)) * 0.9 + exp(-r * r * 4.0) * 0.1;
    a *= vColor.a;
    outColor = vec4(vColor.rgb * a, a);
    return;
  } else if (vStar > 0.5) {
    // Four-point glint: a soft core with thin tapering rays.
    float core = exp(-r * r * 60.0);
    float rays = exp(-abs(q.x) * 38.0) * pow(max(0.0, 1.0 - abs(q.y)), 3.0)
               + exp(-abs(q.y) * 38.0) * pow(max(0.0, 1.0 - abs(q.x)), 3.0);
    float halo = exp(-r * r * 9.0) * 0.18;
    a = core + rays * 0.75 + halo;
  } else {
    float core = exp(-r * r * 30.0);
    float halo = exp(-r * r * 5.0) * 0.28;
    a = core + halo;
  }
  a *= vColor.a;
  outColor = vec4(vColor.rgb * a, a); // additive
}
`

export function createSpeckleRenderer(gl: WebGL2RenderingContext) {
  const prog = compile(gl, VS, FS)
  const u = uniforms(gl, prog, ['uRes', 'uDpr'] as const)
  const vao = gl.createVertexArray()!
  const buf = gl.createBuffer()!
  const STRIDE = 8 // x, y, size, r, g, b, a, star
  let data = new Float32Array(0)
  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE * 4, 0)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE * 4, 8)
  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 12)
  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE * 4, 28)
  gl.bindVertexArray(null)

  return {
    /** layer: 'back' draws most ambient motes and riders, 'front' a few in front of the fish. */
    draw(l: Layout, dpr: number, time: number, ps: Speck[], current: CurrentState, layer: 'back' | 'front') {
      if (data.length < ps.length * STRIDE) data = new Float32Array(ps.length * STRIDE)
      const ribbons = RIBBONS
      const near = (p: Speck) => {
        const d = Math.hypot(p.x - pointer.x, p.y - pointer.y)
        return Math.max(0, 1 - d / 220) * Math.max(pointer.repel, pointer.attract)
      }
      const fill = (painted: boolean) => {
        let n = 0
        for (let i = 0; i < ps.length; i++) {
          const p = ps[i]!
          const front = p.ribbon < 0 && i % 5 === 0
          if ((layer === 'front') !== front) continue
          if ((p.star === 2) !== painted) continue
          let a = painted ? p.glow : p.glow * (0.55 + 0.45 * Math.sin(time * p.rate + p.twinkle))
          if (p.star === 1) a *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * p.rate * 0.8 + p.twinkle), 3)
          if (p.ribbon >= 0) a *= visibilityAt(current, p.t, ribbons[p.ribbon]!.lag)
          a *= 1 + near(p) * 0.9 // brighten when stirred
          if (a < 0.01) continue
          const o = n * STRIDE
          data[o] = p.x
          data[o + 1] = p.y
          data[o + 2] = p.size
          data[o + 3] = p.color[0]
          data[o + 4] = p.color[1]
          data[o + 5] = p.color[2]
          data[o + 6] = Math.min(1, a)
          data[o + 7] = p.star
          n++
        }
        return n
      }
      gl.useProgram(prog)
      gl.uniform2f(u.uRes, l.width, l.height)
      gl.uniform1f(u.uDpr, dpr)
      gl.bindVertexArray(vao)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      // Painted flecks sit in the water like paint; the motes glow additively.
      for (const painted of [true, false]) {
        const n = fill(painted)
        if (!n) continue
        gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * STRIDE), gl.DYNAMIC_DRAW)
        gl.blendFunc(gl.ONE, painted ? gl.ONE_MINUS_SRC_ALPHA : gl.ONE)
        gl.drawArrays(gl.POINTS, 0, n)
      }
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    },
  }
}
