// Shared pointer state for the scene. Hovering repels, pressing and holding draws
// things in, and a quick press on a fish flips it around (handled by the scene).

export type PointerState = {
  x: number
  y: number
  inside: boolean // pointer is over the page
  down: boolean
  downAt: number
  consumed: boolean // this press hit a fish, so it doesn't turn into an "attract"
  attract: number // 0..1, eased — how strongly things are drawn to the cursor
  repel: number // 0..1, eased — fades in on hover, out when the pointer leaves
  speed: number // px/s, smoothed pointer speed
}

export const pointer: PointerState = {
  x: -9999,
  y: -9999,
  inside: false,
  down: false,
  downAt: 0,
  consumed: false,
  attract: 0,
  repel: 0,
  speed: 0,
}

// A press must be held this long before it counts as "call the fish over", so a click
// on a fish (or anywhere) doesn't make everything lurch toward the cursor.
const HOLD_MS = 140

export function updatePointer(dt: number, now: number) {
  const wantAttract = pointer.down && !pointer.consumed && now - pointer.downAt > HOLD_MS ? 1 : 0
  const wantRepel = pointer.inside && !wantAttract ? 1 : 0
  pointer.attract += (wantAttract - pointer.attract) * (1 - Math.exp(-dt * (wantAttract ? 4 : 2.5)))
  pointer.repel += (wantRepel - pointer.repel) * (1 - Math.exp(-dt * 5))
  pointer.speed *= Math.exp(-dt * 6)
}
