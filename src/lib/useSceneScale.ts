import { useEffect, useState } from 'react'

// The Figma frame is a 16" MacBook Pro artboard.
export const FRAME_WIDTH = 1728
export const FRAME_HEIGHT = 1117

export function sceneScale() {
  if (typeof window === 'undefined') return 1
  return Math.min(window.innerWidth / FRAME_WIDTH, window.innerHeight / FRAME_HEIGHT)
}

/** Ratio between the current viewport and the Figma frame, kept up to date on resize. */
export function useSceneScale() {
  const [scale, setScale] = useState(sceneScale)
  useEffect(() => {
    const onResize = () => setScale(sceneScale())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return scale
}
