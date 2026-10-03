// Mapping between the 1728 × 1117 Figma frame and the browser window.

export const FRAME_W = 1728
export const FRAME_H = 1117

export type Layout = {
  width: number // css px
  height: number
  scale: number // frame px → css px
  offsetX: number // frame (0,0) in css px when the frame is centred
  offsetY: number
}

export function computeLayout(width: number, height: number): Layout {
  const scale = Math.min(width / FRAME_W, height / FRAME_H)
  return {
    width,
    height,
    scale,
    offsetX: (width - FRAME_W * scale) / 2,
    offsetY: (height - FRAME_H * scale) / 2,
  }
}

export function frameToScreen(l: Layout, fx: number, fy: number) {
  return { x: l.offsetX + fx * l.scale, y: l.offsetY + fy * l.scale }
}

/** Frame coords measured from the bottom-right corner, pinned to the window's corner. */
export function cornerToScreen(l: Layout, fx: number, fy: number) {
  return {
    x: l.width + (fx - FRAME_W) * l.scale,
    y: l.height + (fy - FRAME_H) * l.scale,
  }
}
