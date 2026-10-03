import { useEffect, useState } from 'react'
import { Background } from './components/Background.js'
import { Grain } from './components/Grain.js'
import { Aquarium } from './scene/Aquarium.js'
import { useClock } from './lib/useClock.js'
import { useSceneScale } from './lib/useSceneScale.js'

function useWebGPUAdapter() {
  const [ok, setOk] = useState<boolean | null>(() => ('gpu' in navigator ? null : false))
  useEffect(() => {
    let cancelled = false
    if (!('gpu' in navigator)) return
    navigator.gpu
      .requestAdapter()
      .then((a) => !cancelled && setOk(a != null))
      .catch(() => !cancelled && setOk(false))
    return () => {
      cancelled = true
    }
  }, [])
  return ok
}

export default function App() {
  const { time, date } = useClock()
  const scale = useSceneScale()
  const webgpu = useWebGPUAdapter()
  const [visitors, setVisitors] = useState<string[]>([])

  // Fira Code 16px on the 1728px frame (82:19), scaled with the window.
  const fontSize = Math.max(10, 16 * scale)
  const edge = Math.max(16, 95 * scale)
  const textBase = {
    fontFamily: "'Fira Code', ui-monospace, Consolas, monospace",
    fontWeight: 300,
    fontSize,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    userSelect: 'none',
  } as const

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
        backgroundImage:
          'linear-gradient(158.36deg, rgb(39, 31, 151) 3.0963%, rgb(3, 7, 42) 91.018%)',
      }}
    >
      {webgpu === false ? (
        // Without WebGPU the light-ray shader can't run; keep a soft wash of light instead.
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            background:
              'radial-gradient(38% 30% at 9% 0%, rgba(140,215,255,0.5), transparent 70%), linear-gradient(118deg, rgba(90,130,255,0.32) 8%, rgba(110,90,255,0.16) 30%, transparent 55%)',
          }}
        />
      ) : (
        <Background />
      )}
      <Aquarium onVisitors={setVisitors} />
      <Grain />
      {/* Date over time, top right. */}
      <div
        style={{
          ...textBase,
          position: 'fixed',
          top: 47 * scale,
          right: edge,
          zIndex: 3,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 16 * scale,
          color: '#bebebe',
          lineHeight: 'normal',
        }}
      >
        <div>{date}</div>
        <div>{time}</div>
      </div>
      {/* Fish that swam off-screen and came back. */}
      <div
        aria-live="polite"
        style={{
          ...textBase,
          position: 'fixed',
          left: Math.max(16, 95.23 * scale),
          bottom: Math.max(16, 47 * scale),
          zIndex: 3,
          width: Math.max(200, 400 * scale),
          display: 'flex',
          flexDirection: 'column',
          gap: 4 * scale,
          color: '#bebebe',
          lineHeight: 1.5,
          whiteSpace: 'normal',
        }}
      >
        <div style={{ fontWeight: 700 }}>visitors:</div>
        <div>{visitors.length ? visitors.join(', ') : 'none yet'}</div>
      </div>
    </div>
  )
}
