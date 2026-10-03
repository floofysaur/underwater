import { useEffect, useState } from 'react'

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

function format(now: Date) {
  let hours = now.getHours()
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const period = hours >= 12 ? 'pm' : 'am'
  hours = hours % 12
  if (hours === 0) hours = 12
  const time = `${hours}:${minutes} ${period}`
  const date = `${MONTHS[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
  return { time, date }
}

/** A live clock, formatted to match the Figma design's lowercase "3:15 pm" style. */
export function useClock() {
  const [value, setValue] = useState(() => format(new Date()))

  useEffect(() => {
    const id = window.setInterval(() => {
      setValue(format(new Date()))
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return value
}
