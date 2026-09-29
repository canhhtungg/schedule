import { Lunar } from 'lunar-javascript'

export const pad = (value) => String(value).padStart(2, '0')

export function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return dateKey(date) === value ? date : null
}

export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
export const sameDay = (a, b) => dateKey(a) === dateKey(b)
export const startOfWeek = (date) => addDays(date, -((date.getDay() + 6) % 7))

export function shiftMonth(date, amount) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  return target
}

export function vietnameseLunarDate(date) {
  const lunar = Lunar.fromDate(date)
  return {
    day: lunar.getDay(),
    month: Math.abs(lunar.getMonth()),
    year: lunar.getYear(),
    leap: lunar.getMonth() < 0,
  }
}

export function lunarLabel(date) {
  const lunar = vietnameseLunarDate(date)
  return lunar.day === 1 ? `1/${lunar.month}${lunar.leap ? 'N' : ''}` : String(lunar.day)
}

export function isLunarHighlight(date) {
  const day = vietnameseLunarDate(date).day
  return day === 1 || day === 15
}
