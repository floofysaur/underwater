import { useMemo } from 'react'
import { ShaderEffect } from '../lib/shader-runtime/index.js'
import {
  setup as lightRaysSetup,
  render as lightRaysRender,
  manifest as lightRaysManifest,
} from '../lib/custom-effects/light-rays.js'
import {
  setup as bokehSetup,
  render as bokehRender,
  manifest as bokehManifest,
} from '../lib/custom-effects/bokeh-particles.js'
import {
  setup as particlesSetup,
  render as particlesRender,
  manifest as particlesManifest,
} from '../lib/custom-effects/glowing-particles.js'

/**
 * Full-bleed ambient shader layer from frame 82:19: light rays, the soft bokeh
 * particles in the bottom-right, and glowing particles that respond to the pointer. Rendered with no `children`, so the shader runtime never
 * needs the (still experimental) HTML-in-Canvas API — it only needs WebGPU. The
 * canvas gets `pointer-events: none` automatically in that mode, so it never blocks
 * clicks on the fish or UI above it, while the runtime still tracks the pointer
 * globally via `window`.
 */
export function Background() {
  const shaders = useMemo(
    () => [
      {
        setup: lightRaysSetup,
        render: lightRaysRender,
        manifest: lightRaysManifest,
        params: {
          speed: 0.31,
          lightSource: { x: -5.703423023223877, y: -62.32744216918945, radius: 129.9220733642578, angle: 111.2674789428711 },
          inputMode: 0,
          intensity: 0,
          threshold: 1,
          beamSoftness: 0.5199999809265137,
          color1: { r: 0.10196078568696976, g: 0.7372549176216125, b: 0.9960784316062927, a: 1 },
          colorBlend: 0,
          spread: 1,
          glow: 0.08999999612569809,
          color2: { r: 0.6352941393852234, g: 0.3490196168422699, b: 1, a: 1 },
          density: 0.5600000023841858,
        },
      },
      {
        setup: bokehSetup,
        render: bokehRender,
        manifest: bokehManifest,
        params: {
          sizeVariation: 50,
          particleSize: 8,
          transform: { x: 82.76754760742188, y: 81.16756439208984, radius: 27.287593841552734, angle: -30 },
          pathRandomness: 38,
          glowColor: {
            stops: [
              { position: 0, color: { r: 1, g: 0.18301156163215637, b: 0.5506563782691956, a: 1 } },
              { position: 0.5, color: { r: 1, g: 0.6774489283561707, b: 0.19362229108810425, a: 1 } },
              { position: 1, color: { r: 0.26235175132751465, g: 0.20187458395957947, b: 0.605055570602417, a: 1 } },
            ],
          },
          edge: 100,
          density: 29,
          direction: 360,
          glowIntensity: 65,
          phase: 0,
          scatterRadius: 86,
        },
      },
      {
        setup: particlesSetup,
        render: particlesRender,
        manifest: particlesManifest,
        params: {
          particleSpeed: 0.8500000238418579,
          sourceSampling: false,
          particleCount: 142,
          interactionFalloff: 1.600000023841858,
          particleSize: 2,
          particleRegion: { x: 55.96979904174805, y: 59.23528289794922, radius: 96 },
          interactionRadius: 30,
          glowIntensity: 1.149999976158142,
          particleColor: { r: 0.4019632637500763, g: 0.45791909098625183, b: 0.6117976307868958, a: 1 },
          trails: 1,
          density: 2,
          // 0 = attract, 1 = repel — the particles drift away from the cursor.
          pointerMode: 1,
          interactionStrength: 0.8799999952316284,
          drift: 0.6000000238418579,
          accentColor: { r: 0.6012305617332458, g: 0.45033594965934753, b: 0.773681640625, a: 1 },
        },
      },
    ],
    [],
  )

  return (
    <ShaderEffect
      shaders={shaders}
      className="ambient-shader"
    />
  )
}
