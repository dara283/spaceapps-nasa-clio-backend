import { Router } from 'express'
import { z } from 'zod'
import { loadCSV, getAvailableVariables, selectSubset, computeStats } from './csv.js'

const router = Router()

const csvPath = process.env.CSV_PATH
if (!csvPath) console.warn('⚠ CSV_PATH not set — analysis disabled.')
else await loadCSV(csvPath)

router.get('/variables', (_req, res) => {
  res.json({ variables: getAvailableVariables() })
})

const baseSchema = z.object({
  location: z.string().optional(),
  coordinates: z.object({ lat: z.number(), lon: z.number() }).nullable().optional(),
  timeframe: z.enum(['specific-date','month','season','year-round']),
  date: z.string().optional(),
  month: z.string().optional(),
  season: z.string().optional(),
  variables: z.array(z.string()).min(1),
  thresholds: z.record(z.any()).optional(),
  trendAdjust: z.object({ enable: z.boolean().default(false), targetYear: z.number().optional() }).optional()
})

router.post('/', (req, res) => {
  const parsed = baseSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json(parsed.error)
  const { coordinates, timeframe, date, month, season, variables, thresholds, trendAdjust } = parsed.data

  const subset = selectSubset({
    coords: coordinates || null,
    timeframe, date, month, season,
    radiusDeg: Number(process.env.CSV_RADIUS_DEG || 1.0)
  })

  const data = computeStats(subset, variables, thresholds || {}, trendAdjust)
  res.json({ data })
})

router.post('/timeline', (req, res) => {
  const schema = baseSchema.extend({
    startDate: z.string(),
    months: z.number().min(1).max(12).default(6),
    stepDays: z.number().min(1).max(14).default(7)
  })
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json(parsed.error)
  const { coordinates, variables, thresholds, startDate, months, stepDays, trendAdjust } = parsed.data

  const start = new Date(startDate)
  const out = []
  const totalDays = Math.round(months * 30.4375)
  for (let i=0; i<=totalDays; i+=stepDays) {
    const d = new Date(start.getTime() + i*86400000)
    const subset = selectSubset({
      coords: coordinates || null,
      timeframe: 'specific-date',
      date: d.toISOString().slice(0,10),
      radiusDeg: Number(process.env.CSV_RADIUS_DEG || 1.0)
    })
    const data = computeStats(
      subset, variables, thresholds || {},
      trendAdjust ? { ...trendAdjust, targetYear: d.getFullYear() } : undefined
    )
    out.push({ date: d.toISOString().slice(0,10), data })
  }

  res.json({ points: out })
})

export default router
