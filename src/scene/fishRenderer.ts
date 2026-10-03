import { compile, uniforms } from './gl.js'
import type { Fish } from './fish.js'
import { depthScale, fishSize, flipScale } from './fish.js'
import type { Layout } from './layout.js'

// Fish are flat painted drawings, animated for grace:
//  - Everything updates every display frame: the body wave, fins, tilt and turn all flow
//    continuously, with no held drawings.
//  - The body follows a smooth travelling wave; fins ripple a beat behind (follow-through).
//  - Turning around, the fish narrows as it swings edge-on, curling gently into the turn.
//  - A very soft, slowly drifting wobble keeps a hint of the hand-drawn line.
//  - 2.5D layering: every fish is a flat card at its own depth, drawn back to front.

const COLS = 40
const ROWS = 14

const VS = `#version 300 es
layout(location=0) in vec2 aGrid;
uniform vec2 uRes;
uniform vec2 uSize;
uniform vec2 uPos;
uniform float uScale;
uniform float uAngle;
uniform float uFlip;
uniform float uHeadRight;
uniform float uPhase;
uniform float uAmp;
uniform float uWaves;
uniform float uHeadAmp;
uniform float uFin;
uniform float uFinPhase;
uniform float uCurl;
uniform float uStretch;
uniform float uBoil;      // css px
uniform float uBoilSeed;
out vec2 vUv;
out vec2 vScreen; // css px, y down

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

// Smooth swim wave.
float pose(float x) {
  return sin(x);
}

float spine(float u) {
  float env = uHeadAmp + (1.0 - uHeadAmp) * pow(smoothstep(0.15, 1.0, u), 2.2);
  float d = u - 0.35;
  return uAmp * env * pose(6.2831853 * uWaves * u - uPhase) + uCurl * d * d;
}

void main() {
  vUv = aGrid;
  float lx = aGrid.x - 0.5;
  float ly = aGrid.y - 0.5;
  bool headRight = uHeadRight > 0.5;
  float u = headRight ? 0.5 - lx : 0.5 + lx; // 0 head … 1 tail
  float tailDir = headRight ? -1.0 : 1.0;
  float w = uSize.x, h = uSize.y;

  // Bend the body along its spine; the cross-section follows the spine's normal.
  float s = spine(u);
  float e = 0.012;
  float slope = (spine(u + e) - spine(u - e)) / (2.0 * e);
  vec2 n = normalize(vec2(-slope * h * tailDir / w, 1.0));

  // Fins trail the body: their ripple runs a beat behind the stroke.
  float edge = clamp((abs(ly) - 0.24) / 0.26, 0.0, 1.0);
  float fin = uFin * edge * edge * pose(3.2 * u - uFinPhase + sign(ly) * 0.9) * (0.25 + 0.75 * u * u);

  vec2 p = vec2(lx * w, s * h) + n * (ly * h) + vec2(0.0, fin * h);

  // An optional, very slow drift of the line (off by default: it read as jiggle).
  if (uBoil > 0.0) {
    vec2 q = aGrid * vec2(3.0, 1.5) + vec2(uBoilSeed, uBoilSeed * 0.7);
    p += (vec2(noise(q), noise(q + 41.7)) - 0.5) * 2.0 * uBoil;
  }

  p.x *= 1.0 + uStretch;
  p.y *= 1.0 - uStretch * 0.6;
  p.x *= uFlip;
  float c = cos(uAngle), sn = sin(uAngle);
  p = vec2(p.x * c - p.y * sn, p.x * sn + p.y * c) * uScale + uPos;
  vScreen = p;
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`

// The light-ray shader (Background, frame 82:19) runs on WebGPU underneath this canvas,
// so it can't reach the fish directly. In Figma the rays are applied to the whole frame,
// fish included: content + rayColor. This is a straight GLSL port of that shader's ray
// term with the frame's parameters, added to each fish so they're lit the same way.
const FS = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vScreen;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime; // seconds, same clock as the shader runtime
out vec4 outColor;

const float PI = 3.14159265359;
// Light rays params (82:19).
const vec2 LIGHT_XY = vec2(-5.703423023223877, -62.32744216918945) / 100.0;
const float LIGHT_RADIUS = 129.9220733642578;
const float LIGHT_ANGLE = 111.2674789428711;
const float SPEED = 0.3100000023841858;
const float INTENSITY = 0.0;
const float SPREAD = 1.0;
const float COLOR_BLEND = 0.0;
const float DENSITY = 0.5600000023841858;
const float SOFTNESS = 0.5199999809265137;
const vec3 COLOR1 = vec3(0.10196078568696976, 0.7372549176216125, 0.9960784316062927);
const vec3 COLOR2 = vec3(0.6352941393852234, 0.3490196168422699, 1.0);

float rayStrength(vec2 sourceToPoint, vec2 rayRefDirection, float reach, float bandBase,
                  float bandSwing, float seedA, float seedB, float speed, float time) {
  float sourceDistance = length(sourceToPoint);
  vec2 sourceDirection = sourceDistance > 0.0001 ? sourceToPoint / max(sourceDistance, 0.0001) : rayRefDirection;
  float cosAngle = dot(sourceDirection, rayRefDirection);
  float wave = (0.15 * sin(cosAngle * seedA + time * speed) + 0.20 * cos(-cosAngle * seedB + time * speed)) / 0.35;
  float bandStrength = clamp(bandBase + bandSwing * wave, 0.0, 1.0);
  float distanceModulation = clamp((reach - sourceDistance) / reach, 0.5, 1.0);
  float reachFade = 1.0 - smoothstep(reach * 0.35, reach, sourceDistance);
  float pulse = 1.0 - 0.16 * sin(time * speed * 0.55 + seedA * 0.1) - 0.07 * sin(time * speed * 1.27 + seedB * 0.1);
  return bandStrength * distanceModulation * reachFade * pulse;
}

vec3 rays(vec2 uv) {
  vec2 dims = max(uRes, vec2(1.0));
  float shortestSide = max(min(dims.x, dims.y), 1.0);
  vec2 uvToEqual = dims / shortestSide;
  vec2 sourceToPoint = uv * uvToEqual - LIGHT_XY * uvToEqual;
  float distanceFromLight = length(sourceToPoint);
  float colorBlend = COLOR_BLEND * 0.5 + 0.5;
  float detailScale = pow(2.0, mix(-2.4, 2.4, DENSITY));
  float animationSpeed = mix(0.2, 4.0, SPEED);
  float lightAngle = radians(LIGHT_ANGLE);
  vec2 rayDirection = vec2(cos(lightAngle), sin(lightAngle));
  float halfArc = mix(0.16, PI * 1.7, SPREAD);
  float pointAngle = atan(sourceToPoint.y, sourceToPoint.x);
  float angleFromAxis = atan(sin(pointAngle - lightAngle), cos(pointAngle - lightAngle));
  float rangeMask = 1.0 - smoothstep(halfArc * 0.6, halfArc, abs(angleFromAxis));
  float reach = max((LIGHT_RADIUS / 100.0) * (dims.y / shortestSide) * 2.0, 0.005);
  float si = 1.0 - SOFTNESS;
  float softnessContrast = si * si * si * (si * (si * 6.0 - 15.0) + 10.0);
  float bandBase = mix(1.10, 0.40, softnessContrast);
  float bandSwing = mix(0.05, 0.65, softnessContrast);
  float band1 = rayStrength(sourceToPoint, rayDirection, reach, bandBase, bandSwing, 36.2214 * detailScale, 21.11349 * detailScale, animationSpeed, uTime) * rangeMask;
  float band2 = rayStrength(sourceToPoint, rayDirection, reach, bandBase, bandSwing, 22.3991 * detailScale, 18.0234 * detailScale, animationSpeed * 0.2, uTime) * rangeMask;
  float normalizedDistance = distanceFromLight / reach;
  float distanceBrightness = mix(0.5, 4.0, INTENSITY) * 0.4 / pow(max(normalizedDistance, 0.001), 1.7);
  vec3 rays1 = COLOR1 * band1 * (1.0 - colorBlend) * 0.9;
  vec3 rays2 = COLOR2 * band2 * colorBlend * 0.9;
  return (rays1 + rays2) * distanceBrightness;
}

void main() {
  vec4 c = texture(uTex, vUv); // premultiplied
  if (c.a <= 0.001) discard;
  // Rays add onto the painted colour, exactly as the frame's effect does; the clamp is
  // what the display would do to the straight colour anyway.
  c.rgb = min(c.rgb + rays(vScreen / uRes) * c.a, vec3(c.a));
  outColor = c;
}
`

/** Per-fish presentation values, eased every frame so nothing snaps. */
type Look = { curl: number; stretch: number; excite: number }

export function createFishRenderer(gl: WebGL2RenderingContext) {
  const prog = compile(gl, VS, FS)
  const u = uniforms(gl, prog, [
    'uRes', 'uSize', 'uPos', 'uScale', 'uAngle', 'uFlip', 'uHeadRight', 'uPhase', 'uAmp',
    'uWaves', 'uHeadAmp', 'uFin', 'uFinPhase', 'uCurl', 'uStretch', 'uBoil', 'uBoilSeed',
    'uTex', 'uTime',
  ] as const)

  const verts = new Float32Array((COLS + 1) * (ROWS + 1) * 2)
  let k = 0
  for (let y = 0; y <= ROWS; y++) {
    for (let x = 0; x <= COLS; x++) {
      verts[k++] = x / COLS
      verts[k++] = y / ROWS
    }
  }
  const idx = new Uint16Array(COLS * ROWS * 6)
  k = 0
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = y * (COLS + 1) + x
      idx.set([i, i + 1, i + COLS + 1, i + 1, i + COLS + 2, i + COLS + 1], k)
      k += 6
    }
  }
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const vb = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vb)
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  const ib = gl.createBuffer()!
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)
  gl.bindVertexArray(null)

  const looks = new Map<Fish, Look>()
  let lastTime = -1

  return {
    draw(l: Layout, time: number, fishes: Fish[], textures: Map<string, WebGLTexture>) {
      gl.useProgram(prog)
      gl.bindVertexArray(vao)
      gl.uniform2f(u.uRes, l.width, l.height)
      gl.uniform1i(u.uTex, 0)
      gl.uniform1f(u.uTime, time)
      gl.activeTexture(gl.TEXTURE0)
      const dt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, time - lastTime))
      lastTime = time
      const ease = (rate: number) => 1 - Math.exp(-rate * dt)

      // Back to front: each fish is a flat card at its own depth.
      const order = [...fishes].sort((a, b) => a.z - b.z)
      for (const f of order) {
        const tex = textures.get(f.def.id)
        if (!tex) continue
        const m = f.def.motion
        const { w, h } = fishSize(f, l)

        const flip = flipScale(f)
        const turning = Math.max(-1, Math.min(1, f.yawVel / Math.max(m.maxTurn, 0.01)))
                const fast = Math.min(1, Math.max(0, f.speed / Math.max(m.cruise * l.scale, 1) - 1.5))
        // Curl gently into a turn: most while edge-on, always toward the turn's side.
        const curlTarget = -turning * (0.14 + (1 - Math.abs(flip)) * 0.3)
        let look = looks.get(f)
        if (!look) {
          look = { curl: curlTarget, stretch: 0, excite: f.excite }
          looks.set(f, look)
        }
        look.curl += (curlTarget - look.curl) * ease(4)
        look.stretch += (fast * 0.06 - look.stretch) * ease(3)
        look.excite += (f.excite - look.excite) * ease(3)

        const bob = Math.sin(time * 0.6 + f.seed * 4) * m.bob * l.scale
        const excite = 1 + look.excite * 0.15
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.uniform2f(u.uSize, w, h)
        gl.uniform2f(u.uPos, f.x, f.y + bob)
        gl.uniform1f(u.uScale, depthScale(f))
        gl.uniform1f(u.uAngle, f.pitch * Math.cos(f.yaw))
        gl.uniform1f(u.uFlip, flip)
        gl.uniform1f(u.uHeadRight, f.def.facing > 0 ? 1 : 0)
        gl.uniform1f(u.uPhase, f.phase)
        gl.uniform1f(u.uAmp, m.wave * excite)
        gl.uniform1f(u.uWaves, m.waveCount)
        gl.uniform1f(u.uHeadAmp, m.headAmp)
        gl.uniform1f(u.uFin, m.fin * excite)
        gl.uniform1f(u.uFinPhase, f.finPhase)
        gl.uniform1f(u.uCurl, look.curl)
        gl.uniform1f(u.uStretch, look.stretch)
        gl.uniform1f(u.uBoil, 0)
        gl.uniform1f(u.uBoilSeed, f.seed * 7)
        gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0)
      }
      // Forget fish that are gone.
      for (const f of looks.keys()) if (!fishes.includes(f)) looks.delete(f)
    },
  }
}
