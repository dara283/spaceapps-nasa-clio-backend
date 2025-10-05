// src/csv.js
import fs from 'fs'
import { parse } from 'csv-parse'
import * as ss from 'simple-statistics'   


const ALIASES = {
  date: ['date', 'validdate', 'validdate '],
  lat: ['lat','latitude','y'],
  lon: ['lon','longitude','x','lng'],

  temperature: ['temperature','temp','tavg','tmean','t_2m','temperature(⁰c)','temperature(°c)','temperature_c'],
  humidity: ['humidity','rh','humidity(%)','relative_humidity','humidity_pct'],
  precipitation: ['precipitation','prcp','rain','rainfall','precipitation_mm'],
  wind: ['wind','wind_speed','wind_speed_10m'],
  cloud: ['cloud','cloud_cover','clt'],
  dust: ['dust','aerosol','pm25','pm10','aod'],
  snow: ['snow','snow_depth','snd'],
  solar: ['solar','uv','uv_index','solar_radiation']
}

const DEFAULT_UNITS = {
  temperature: '°C',
  humidity: '%',
  precipitation: 'mm',
  wind: 'km/h',
  cloud: '%',
  dust: 'μg/m³',
  snow: 'cm',
  solar: 'UV Index'
}

let rows = []
let discoveredVars = new Set()

function detectDelimiter(firstLine) {
  return firstLine.includes(';') ? ';' : ','
}
function normalizeNumberCell(v) {
  if (v == null || v === '') return null
  const s = String(v).trim().replace(',', '.') // handle decimal comma
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

export async function loadCSV(csvPath) {
  rows = []; discoveredVars = new Set()
  const firstLine = fs.readFileSync(csvPath, 'utf8').split(/\r?\n/)[0] || ''
  const delimiter = detectDelimiter(firstLine)

  await new Promise((resolve, reject) => {
    fs.createReadStream(csvPath)
      .pipe(parse({ columns: true, trim: true, delimiter }))
      .on('data', (r) => {
        const n = normalizeRow(r, buildHeaderMap(Object.keys(r)))
        if (!n) return
        for (const k of Object.keys(n)) {
          if (['date','lat','lon'].includes(k)) continue
          n[k] = normalizeNumberCell(n[k])
        }
        rows.push(n)
        Object.keys(n).forEach(k => {
          if (!['date','lat','lon'].includes(k) && n[k] != null) discoveredVars.add(k)
        })
      })
      .on('end', resolve)
      .on('error', reject)
  })

  console.log(`CSV loaded: ${rows.length} rows; vars: ${[...discoveredVars].join(', ')}`)
}

function buildHeaderMap(headers) {
  const map = {}
  const lower = headers.map(h => String(h).trim())
  for (const [canon, aliases] of Object.entries(ALIASES)) {
    const match = lower.find(h => aliases.includes(h.toLowerCase()))
    if (match) map[canon] = match
  }
  // direct match fallback
  lower.forEach(h => {
    const key = h.toLowerCase()
    if (!Object.values(map).includes(h) && ALIASES[key]) map[key] = h
  })
  return map
}

function normalizeRow(r, map) {
  let d = r[map.date] ?? r['date']
  const date = d ? new Date(d) : null
  if (d && isNaN(date)) return null

  const toNum = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))

  const lat = map.lat ? toNum(r[map.lat]) : toNum(r.lat)
  const lon = map.lon ? toNum(r[map.lon]) : toNum(r.lon)

  const out = { date, lat, lon }
  for (const canon of Object.keys(ALIASES)) {
    if (['date','lat','lon'].includes(canon)) continue
    const header = map[canon]
    if (header && r[header] != null) out[canon] = r[header]
  }
  if (!out.date) return null
  return out
}

export function getAvailableVariables() {
  return [...discoveredVars].map(k => ({
    key: k,
    name: toDisplayName(k),
    unit: DEFAULT_UNITS[k] || 'units'
  }))
}

function toDisplayName(key) {
  return ({
    temperature:'Temperature',
    precipitation:'Precipitation',
    wind:'Wind Speed',
    humidity:'Humidity',
    cloud:'Cloud Cover',
    dust:'Dust/Aerosols',
    snow:'Snow',
    solar:'Solar Radiation'
  })[key] || key[0].toUpperCase() + key.slice(1)
}

export function selectSubset({ coords, timeframe, date, month, season, radiusDeg }) {
  let subset = rows
  if (coords?.lat != null && coords?.lon != null) {
    const { lat, lon } = coords
    subset = subset.filter(r =>
      r.lat != null && r.lon != null &&
      Math.abs(r.lat - lat) <= radiusDeg &&
      Math.abs(r.lon - lon) <= radiusDeg
    )
  }

  const windowDays = Number(process.env.CSV_WINDOW_DAYS || 7)

  if (timeframe === 'specific-date' && date) {
    const ref = new Date(date)
    const doyTarget = dayOfYear(ref)
    subset = subset.filter(r => {
      if (!r.date) return false
      const dd = dayOfYear(r.date)
      const diff = Math.abs(dd - doyTarget)
      const wrap = Math.abs(365 - diff)
      return diff <= windowDays || wrap <= windowDays
    })
  } else if (timeframe === 'month' && month) {
    const m = Number(month) - 1
    subset = subset.filter(r => r.date?.getMonth?.() === m)
  } else if (timeframe === 'season' && season) {
    const mset = { spring:[2,3,4], summer:[5,6,7], fall:[8,9,10], winter:[11,0,1] }[season] || []
    subset = subset.filter(r => mset.includes(r.date?.getMonth?.()))
  }

  return subset
}

function dayOfYear(d) {
  const start = new Date(Date.UTC(d.getFullYear(),0,1))
  const diff = (d - start) / 86400000
  return Math.floor(diff) + 1
}

export function computeStats(subset, variables, thresholdsMap, trendAdjustOpts) {
  const result = {}
  const years = subset.map(r => r.date?.getFullYear?.()).filter(y => typeof y==='number')
  const yrMin = years.length ? Math.min(...years) : null
  const yrMax = years.length ? Math.max(...years) : null

  for (const v of variables) {
    const arr = subset.map(r => normalizeNumberCell(r[v])).filter(x => typeof x === 'number')
    if (!arr.length) { result[v] = empty(v); continue }

    let series = [...arr]
    let mean = ss.mean(series)
    const median = ss.median(series)
    const p90 = ss.quantile(series, 0.9)
    const p10 = ss.quantile(series, 0.1)

    // optional trend nudging
    const trendPctPerDecade = trendPercentPerDecade(subset, v)
    if (trendAdjustOpts?.enable && yrMax) {
      const targetYear = trendAdjustOpts.targetYear ?? (new Date()).getFullYear()
      const yearsAhead = targetYear - yrMax
      const factor = 1 + (trendPctPerDecade/100) * (yearsAhead/10)
      series = series.map(x => x * factor)
      mean = ss.mean(series)
    }

    const thrHigh = thresholdsMap?.[v]?.high
    const probability = typeof thrHigh === 'number'
      ? (series.filter(x => x >= thrHigh).length / series.length) * 100
      : 0

    result[v] = {
      probability,
      trend: trendPctPerDecade,
      mean, median, percentile90: p90, percentile10: p10,
      historicalData: series.slice(-30),
      meta: { samples: arr.length, yrMin, yrMax }
    }
  }
  return result
}

function empty() {
  return { probability:0, trend:0, mean:0, median:0, percentile90:0, percentile10:0, historicalData:[], meta:{ samples:0 } }
}

function trendPercentPerDecade(subset, key){
  const pts = subset
    .map(r => ({ x: r.date?.getFullYear?.(), y: normalizeNumberCell(r[key]) }))
    .filter(p => typeof p.x === 'number' && typeof p.y === 'number')
    .map(p => [p.x, p.y])

  if (pts.length < 12) return 0
  const lr = ss.linearRegression(pts)
  const m = lr.m // per year
  const yvals = pts.map(p => p[1])
  const mean = ss.mean(yvals) || 0
  if (mean === 0) return 0
  return (m / mean) * 100 * 10
}
