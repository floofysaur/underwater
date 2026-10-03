import { compile, fullscreenTriangle, uniforms } from './gl.js'
import { cornerToScreen, type Layout } from './layout.js'

// The bottom-right undercurrent: a few painterly violet ribbons that sweep in along
// their length, linger, then drain away and leave the corner empty for a while. While
// it's present it carries speckles along and gently pushes nearby fish.

type Ribbon = {
  p0: [number, number] // frame coords (bottom-right anchored)
  p2: [number, number]
  bow: number // how far the middle sags below the straight line (frame px)
  width: number // frame px
  tone: number // 0 base violet … 1 lighter stroke
  alpha: number
  lag: number // reveal delay along the sweep, so strokes don't move in lockstep
}

export const RIBBONS: Ribbon[] = [
  { p0: [1150, 1175], p2: [1780, 935], bow: 0, width: 110, tone: -0.5, alpha: 0.32, lag: 0.3 },
  { p0: [780, 1112], p2: [1765, 728], bow: 30, width: 74, tone: 0.1, alpha: 0.86, lag: 0.12 },
  { p0: [420, 1122], p2: [1755, 652], bow: 46, width: 56, tone: -0.45, alpha: 0.85, lag: 0 },
  { p0: [1100, 886], p2: [1462, 778], bow: 4, width: 9, tone: 1.0, alpha: 0.55, lag: 0.2 },
]

const FLOW_SPEED = 55 // frame px/s along the ribbons

// ---- timeline -----------------------------------------------------------------------

export type CurrentState = {
  head: number // leading edge of the reveal, in ribbon-length units
  tail: number // trailing edge
  phase: 'present' | 'leaving' | 'gone' | 'arriving'
  timer: number
}

export function createCurrent(): CurrentState {
  // Start present, like the painting.
  return { head: 1.6, tail: -0.6, phase: 'present', timer: 9 + Math.random() * 5 }
}

const SWEEP_SECONDS = 6.5

export function stepCurrent(c: CurrentState, dt: number) {
  const sweep = (2.2 / SWEEP_SECONDS) * dt
  c.timer -= dt
  switch (c.phase) {
    case 'present':
      if (c.timer <= 0) c.phase = 'leaving'
      break
    case 'leaving':
      c.tail += sweep
      if (c.tail >= 1.6) {
        c.phase = 'gone'
        c.timer = 8 + Math.random() * 9
      }
      break
    case 'gone':
      if (c.timer <= 0) {
        c.phase = 'arriving'
        c.head = -0.6
        c.tail = -0.6
      }
      break
    case 'arriving':
      c.head += sweep
      if (c.head >= 1.6) {
        c.phase = 'present'
        c.timer = 11 + Math.random() * 8
      }
      break
  }
}

export function visibilityAt(c: CurrentState, t: number, lag: number) {
  const head = c.head - lag
  const tail = c.tail - lag
  const smooth = (e0: number, e1: number, x: number) => {
    const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
    return k * k * (3 - 2 * k)
  }
  return smooth(tail, tail + 0.35, t) * (1 - smooth(head - 0.35, head, t))
}

// ---- geometry shared by sims and the shader ------------------------------------------

type RibbonScreen = { x0: number; y0: number; dx: number; dy: number; len: number; nx: number; ny: number; bow: number; width: number }

export function ribbonsOnScreen(l: Layout): RibbonScreen[] {
  return RIBBONS.map((r) => {
    const a = cornerToScreen(l, r.p0[0], r.p0[1])
    const b = cornerToScreen(l, r.p2[0], r.p2[1])
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const dx = (b.x - a.x) / len
    const dy = (b.y - a.y) / len
    return { x0: a.x, y0: a.y, dx, dy, len, nx: -dy, ny: dx, bow: r.bow * l.scale, width: r.width * l.scale }
  })
}

/** Point on ribbon `i` at length fraction t, offset across it by `across` (−1…1). */
export function ribbonPoint(rs: RibbonScreen, t: number, across: number) {
  const sag = rs.bow * 4 * t * (1 - t)
  const halfW = rs.width * 0.5 * taper(t)
  const off = sag + across * halfW
  return { x: rs.x0 + rs.dx * rs.len * t + rs.nx * off, y: rs.y0 + rs.dy * rs.len * t + rs.ny * off }
}

function taper(t: number) {
  const k = Math.min(1, Math.max(0, t))
  return 0.5 + 0.5 * Math.pow(Math.sin(Math.PI * k), 0.5)
}

/** Flow velocity (css px/s) the current applies at a screen point, 0 when absent. */
export function flowAt(c: CurrentState, rs: RibbonScreen[], l: Layout, x: number, y: number) {
  let vx = 0
  let vy = 0
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i]!
    const px = x - r.x0
    const py = y - r.y0
    const t = (px * r.dx + py * r.dy) / r.len
    if (t < -0.05 || t > 1.05) continue
    const off = px * r.nx + py * r.ny - r.bow * 4 * t * (1 - t)
    const halfW = r.width * 0.5 * taper(t) * 2.2 // influence reaches a bit beyond the paint
    const inside = Math.max(0, 1 - Math.abs(off) / halfW)
    if (inside <= 0) continue
    const vis = visibilityAt(c, t, RIBBONS[i]!.lag)
    const w = inside * inside * vis * RIBBONS[i]!.alpha
    // Follow the ribbon's curve: tangent of the sagging centre line.
    const slope = r.bow * 4 * (1 - 2 * t) / r.len
    const tx = r.dx + r.nx * slope
    const ty = r.dy + r.ny * slope
    const tl = Math.hypot(tx, ty)
    vx += (tx / tl) * FLOW_SPEED * l.scale * w
    vy += (ty / tl) * FLOW_SPEED * l.scale * w
  }
  return { vx, vy }
}

// ---- rendering --------------------------------------------------------------------------

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;      // css px
uniform float uDpr;
uniform float uTime;
uniform float uHead;
uniform float uTail;
uniform vec4 uSeg[4];   // x0, y0, x1, y1 (css px)
uniform vec4 uShape[4]; // bow, width, tone, alpha (css px)
uniform float uLag[4];
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec4 acc = vec4(0.0); // premultiplied, painted back-to-front
  for (int i = 3; i >= 0; i--) {
    vec2 a = uSeg[i].xy, b = uSeg[i].zw;
    float bow = uShape[i].x, width = uShape[i].y, tone = uShape[i].z, alpha = uShape[i].w;
    vec2 d = b - a;
    float len = length(d);
    vec2 dir = d / len;
    vec2 n = vec2(-dir.y, dir.x);
    vec2 q = p - a;
    float t = dot(q, dir) / len;
    if (t < -0.1 || t > 1.1) continue;
    float across = dot(q, n) - bow * 4.0 * t * (1.0 - t);
    float halfW = 0.5 * width * (0.5 + 0.5 * pow(sin(3.14159 * clamp(t, 0.0, 1.0)), 0.5));
    // Brush edges: a ragged, dry-brush boundary that drifts slowly along the stroke.
    float flow = uTime * 0.035;
    float wob = (fbm(vec2(t * 26.0 - flow * 2.0, float(i) * 7.1)) - 0.5) * halfW * 0.45;
    float k = abs(across) - halfW - wob;
    float body = 1.0 - smoothstep(-1.2, 0.8, k);
    if (body <= 0.0) continue;
    float rel = abs(across) / max(halfW, 1.0);
    // Dry brush: the paint breaks up toward the edges and the ends of the stroke.
    float dry = fbm(vec2(t * 60.0 - flow * 6.0, across / max(width, 1.0) * 3.0 + float(i)));
    float breakup = smoothstep(0.78, 1.0, rel) + smoothstep(0.7, 1.0, abs(t - 0.5) * 2.0);
    body *= 1.0 - clamp(breakup, 0.0, 1.0) * 0.7 * smoothstep(0.4, 0.62, 1.0 - dry);
    // Bristle striations running along the current, drifting with the flow.
    float bristle = fbm(vec2(t * 4.0 - flow * 3.0, across / max(width, 1.0) * 16.0 + float(i) * 3.3));
    float vis;
    {
      float head = uHead - uLag[i], tail = uTail - uLag[i];
      vis = smoothstep(tail, tail + 0.35, t) * (1.0 - smoothstep(head - 0.35, head, t));
    }
    vis = clamp(vis * 1.25 - (1.0 - bristle) * 0.25, 0.0, 1.0);
    vec3 base = mix(vec3(0.18, 0.05, 0.58), vec3(0.3, 0.17, 0.78), clamp(tone, 0.0, 1.0));
    base = mix(base, vec3(0.08, 0.05, 0.44), clamp(-tone, 0.0, 1.0));
    vec3 col = base * (0.85 + 0.3 * bristle);
    float a2 = body * alpha * vis * (0.8 + 0.25 * bristle);
    acc = vec4(col * a2, a2) + acc * (1.0 - a2);
  }
  // The whole undercurrent sits at 40% opacity (premultiplied).
  outColor = acc * 0.4;
}
`

export function createCurrentRenderer(gl: WebGL2RenderingContext) {
  const prog = compile(gl, VS, FS)
  const u = uniforms(gl, prog, ['uRes', 'uDpr', 'uTime', 'uHead', 'uTail', 'uSeg', 'uShape', 'uLag'] as const)
  const vao = fullscreenTriangle(gl)
  const seg = new Float32Array(16)
  const shape = new Float32Array(16)
  const lag = new Float32Array(RIBBONS.map((r) => r.lag))

  return {
    draw(l: Layout, dpr: number, time: number, c: CurrentState) {
      if (c.phase === 'gone') return
      RIBBONS.forEach((r, i) => {
        const a = cornerToScreen(l, r.p0[0], r.p0[1])
        const b = cornerToScreen(l, r.p2[0], r.p2[1])
        seg.set([a.x, a.y, b.x, b.y], i * 4)
        shape.set([r.bow * l.scale, r.width * l.scale, r.tone, r.alpha], i * 4)
      })
      gl.useProgram(prog)
      gl.uniform2f(u.uRes, l.width, l.height)
      gl.uniform1f(u.uDpr, dpr)
      gl.uniform1f(u.uTime, time)
      gl.uniform1f(u.uHead, c.head)
      gl.uniform1f(u.uTail, c.tail)
      gl.uniform4fv(u.uSeg, seg)
      gl.uniform4fv(u.uShape, shape)
      gl.uniform1fv(u.uLag, lag)
      // Only shade the bottom-right corner where the ribbons live.
      const tl = cornerToScreen(l, 360, 560)
      const x0 = Math.max(0, Math.floor(tl.x * dpr))
      const y0 = 0
      const x1 = Math.ceil(l.width * dpr)
      const y1 = Math.ceil((l.height - Math.max(0, tl.y)) * dpr)
      gl.enable(gl.SCISSOR_TEST)
      gl.scissor(x0, y0, x1 - x0, y1 - y0)
      gl.bindVertexArray(vao)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.disable(gl.SCISSOR_TEST)
    },
  }
}
