import blueUrl from '../assets/scene/blue.webp'
import bettaUrl from '../assets/scene/betta.webp'
import tiny1Url from '../assets/scene/tiny1.webp'
import tiny2Url from '../assets/scene/tiny2.webp'
import tiny3Url from '../assets/scene/tiny3.webp'
import dark1Url from '../assets/scene/dark1.webp'
import dark2Url from '../assets/scene/dark2.webp'
import dark3Url from '../assets/scene/dark3.webp'
import dark4Url from '../assets/scene/dark4.webp'
import goldfishUrl from '../assets/scene/goldfish.webp'
import wrasseUrl from '../assets/scene/wrasse.webp'
import acaraUrl from '../assets/scene/acara.webp'
import bassUrl from '../assets/scene/bass.webp'
import catfishUrl from '../assets/scene/catfish.webp'
import troutUrl from '../assets/scene/trout.webp'
import flyingfishUrl from '../assets/scene/flyingfish.webp'
import sardineUrl from '../assets/scene/sardine.webp'

// The fish come from the Figma file: the newer ones are the named layers of frame
// "MacBook Pro 16\" - 2" (82:19); the blue fish and the two small schools were cut out of
// the earlier painted mockup. Positions are the sprite centre in the 1728 × 1117 frame and
// follow frame 82:19, with the older fish tucked into the open water around them.

/** How a fish moves. Distances are frame pixels and get scaled to the window. */
export type MotionProfile = {
  cruise: number // px/s
  fleeSpeed: number // px/s when startled
  maxTurn: number // rad/s — how quickly it can change heading (yaw or pitch)
  turnAccel: number // 1/s — how quickly a turn builds up and settles
  speedEase: number // 1/s — how quickly it speeds up / slows down
  tailHz: number // tail beats per second at cruise
  wave: number // body wave at the tail, fraction of body height
  waveCount: number // wavelengths along the body
  headAmp: number // 0..1 — how much of the wave reaches the head
  fin: number // dorsal / ventral fin ripple, fraction of height
  finSpeed: number // Hz
  maxPitch: number // rad
  bob: number // px — slow buoyant drift
  wanderYaw: number // rad — how far it strays toward / away from the viewer
}

export type SpriteDef = {
  id: string
  name: string // shown in the "visitors" list
  url: string
  kind: 'solid' | 'line'
  w: number
  h: number
  cx: number
  cy: number
  facing: 1 | -1 // which way the head points in the artwork
  pitch: number // initial tilt in the painting (rad)
  school?: 'confetti' | 'shadows' | 'drift'
  depth: number // 0 back … 1 front, draw order
  motion: MotionProfile
}

const deg = (d: number) => (d * Math.PI) / 180

// Big fish with long fins: slow, wide, gliding turns.
const flowing: MotionProfile = {
  cruise: 30,
  fleeSpeed: 110,
  maxTurn: 0.85,
  turnAccel: 1.4,
  speedEase: 0.7,
  tailHz: 0.6,
  wave: 0.065,
  waveCount: 0.6,
  headAmp: 0.015,
  fin: 0.035,
  finSpeed: 0.7,
  maxPitch: 0.22,
  bob: 3,
  wanderYaw: 0.35,
}

// Mid-sized fish: steady, even strokes.
const cruiser: MotionProfile = {
  cruise: 44,
  fleeSpeed: 150,
  maxTurn: 1.4,
  turnAccel: 2.4,
  speedEase: 1.1,
  tailHz: 0.95,
  wave: 0.07,
  waveCount: 0.7,
  headAmp: 0.015,
  fin: 0.02,
  finSpeed: 1.1,
  maxPitch: 0.28,
  bob: 2,
  wanderYaw: 0.4,
}

// Tiny schooling fish: quick, flickering.
const darter: MotionProfile = {
  cruise: 62,
  fleeSpeed: 210,
  maxTurn: 3.0,
  turnAccel: 6,
  speedEase: 2.4,
  tailHz: 2.0,
  wave: 0.08,
  waveCount: 0.8,
  headAmp: 0.02,
  fin: 0.015,
  finSpeed: 2,
  maxPitch: 0.4,
  bob: 1,
  wanderYaw: 0.5,
}

// Slow bottom-dweller.
const prowler: MotionProfile = {
  ...cruiser,
  cruise: 24,
  fleeSpeed: 110,
  maxTurn: 0.8,
  tailHz: 0.6,
  wave: 0.06,
  maxPitch: 0.16,
  wanderYaw: 0.3,
}

export const SPRITES: SpriteDef[] = [
  // Small schools.
  { id: 'dark1', name: 'minnows', url: dark1Url, kind: 'solid', w: 52, h: 25, cx: 1085, cy: 432, facing: -1, pitch: 0, school: 'shadows', depth: 0.2, motion: darter },
  { id: 'dark2', name: 'minnows', url: dark2Url, kind: 'solid', w: 60, h: 27, cx: 1160, cy: 414, facing: -1, pitch: 0, school: 'shadows', depth: 0.2, motion: darter },
  { id: 'dark3', name: 'minnows', url: dark3Url, kind: 'solid', w: 53, h: 27, cx: 1138, cy: 456, facing: -1, pitch: 0, school: 'shadows', depth: 0.2, motion: darter },
  { id: 'dark4', name: 'minnows', url: dark4Url, kind: 'solid', w: 45, h: 25, cx: 1208, cy: 440, facing: -1, pitch: 0, school: 'shadows', depth: 0.2, motion: darter },
  // A second, separate school of minnows, upper left.
  { id: 'dark5', name: 'minnows', url: dark2Url, kind: 'solid', w: 56, h: 25, cx: 150, cy: 250, facing: -1, pitch: 0, school: 'drift', depth: 0.3, motion: darter },
  { id: 'dark6', name: 'minnows', url: dark1Url, kind: 'solid', w: 50, h: 24, cx: 215, cy: 228, facing: -1, pitch: 0, school: 'drift', depth: 0.3, motion: darter },
  { id: 'dark7', name: 'minnows', url: dark4Url, kind: 'solid', w: 45, h: 25, cx: 205, cy: 280, facing: -1, pitch: 0, school: 'drift', depth: 0.3, motion: darter },
  { id: 'dark8', name: 'minnows', url: dark3Url, kind: 'solid', w: 50, h: 26, cx: 270, cy: 258, facing: -1, pitch: 0, school: 'drift', depth: 0.3, motion: darter },
  { id: 'dark9', name: 'minnows', url: dark2Url, kind: 'solid', w: 48, h: 22, cx: 110, cy: 290, facing: -1, pitch: 0, school: 'drift', depth: 0.3, motion: darter },
  { id: 'tiny1', name: 'guppies', url: tiny1Url, kind: 'solid', w: 107, h: 45, cx: 720, cy: 712, facing: 1, pitch: deg(-34.25), school: 'confetti', depth: 0.62, motion: darter },
  { id: 'tiny2', name: 'guppies', url: tiny2Url, kind: 'solid', w: 98, h: 43, cx: 650, cy: 780, facing: 1, pitch: deg(-17.35), school: 'confetti', depth: 0.62, motion: darter },
  { id: 'tiny3', name: 'guppies', url: tiny3Url, kind: 'solid', w: 89, h: 37, cx: 770, cy: 790, facing: 1, pitch: deg(-16.16), school: 'confetti', depth: 0.62, motion: darter },
  // Frame 82:19.
  { id: 'catfish', name: 'catfish', url: catfishUrl, kind: 'solid', w: 555, h: 221, cx: 1319.5, cy: 624.1, facing: -1, pitch: 0, depth: 0.35, motion: prowler },
  { id: 'trout', name: 'rainbow trout', url: troutUrl, kind: 'solid', w: 411, h: 186, cx: 1463, cy: 269.4, facing: -1, pitch: 0, depth: 0.4, motion: { ...cruiser, cruise: 38, tailHz: 0.8 } },
  { id: 'sardine', name: 'sardine', url: sardineUrl, kind: 'solid', w: 232, h: 93, cx: 748.9, cy: 559.8, facing: -1, pitch: 0, depth: 0.5, motion: { ...cruiser, cruise: 52, tailHz: 1.3, maxTurn: 1.6 } },
  { id: 'wrasse', name: 'wrasse', url: wrasseUrl, kind: 'solid', w: 277, h: 124, cx: 887.6, cy: 345.2, facing: -1, pitch: 0, depth: 0.55, motion: cruiser },
  { id: 'blue', name: 'bluefish', url: blueUrl, kind: 'solid', w: 308, h: 113, cx: 1085, cy: 185, facing: -1, pitch: 0, depth: 0.52, motion: cruiser },
  { id: 'goldfish', name: 'goldfish', url: goldfishUrl, kind: 'solid', w: 238, h: 198, cx: 452.7, cy: 345.2, facing: 1, pitch: 0, depth: 0.6, motion: { ...flowing, cruise: 26, fin: 0.045 } },
  { id: 'flyingfish', name: 'flying fish', url: flyingfishUrl, kind: 'solid', w: 272, h: 99, cx: 797, cy: 931.5, facing: -1, pitch: 0, depth: 0.65, motion: { ...cruiser, cruise: 50, tailHz: 1.15 } },
  { id: 'acara', name: 'blue acara', url: acaraUrl, kind: 'solid', w: 251, h: 157, cx: 446.7, cy: 784, facing: -1, pitch: 0, depth: 0.7, motion: { ...cruiser, cruise: 36 } },
  { id: 'bass', name: 'bass', url: bassUrl, kind: 'solid', w: 301, h: 138, cx: 1237.1, cy: 912.3, facing: -1, pitch: 0, depth: 0.75, motion: { ...cruiser, cruise: 40, tailHz: 0.9 } },
  { id: 'betta', name: 'betta', url: bettaUrl, kind: 'solid', w: 411, h: 231, cx: 247, cy: 559.8, facing: 1, pitch: 0, depth: 0.85, motion: { ...flowing, cruise: 28, fin: 0.045 } },
]
