// src/index.js
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'


import analysisRoutes from './analysis.js'
import authRoutes from './routes/auth.js'
import savesRoutes from './routes/saved.js'   // <-- change this
// ...

const app = express()

/* -------------------- Core middleware -------------------- */
const defaultOrigins = [
  'http://localhost:5173', // Vite default
  'http://127.0.0.1:5173',
  'http://localhost:4173', // Vite preview
  'http://127.0.0.1:4173'
]

// Allow single origin via env OR fall back to common dev origins list
const corsOption =
  process.env.CORS_ORIGIN
    ? { origin: process.env.CORS_ORIGIN, credentials: true }
    : {
        origin: (origin, cb) => {
          if (!origin || defaultOrigins.includes(origin)) return cb(null, true)
          return cb(null, true) // during dev, be permissive
        },
        credentials: true
      }

app.disable('x-powered-by')
app.use(cors(corsOption))
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

/* -------------------- Health + Home -------------------- */
app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Space Apps API</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:32px;background:#0b1526;color:#eaf2ff}
    a{color:#2E96F5;text-decoration:none} a:hover{text-decoration:underline}
    .card{background:#0f1b2d;border:1px solid #1c2c49;border-radius:10px;padding:16px;max-width:820px}
    code{background:#08111f;padding:2px 6px;border-radius:4px}
    pre{background:#08111f;padding:12px;border-radius:8px;overflow:auto}
  </style>
</head>
<body>
  <h1>🚀 Space Apps Weather API</h1>
  <div class="card">
    <p>Server is running. Try these endpoints:</p>
    <ul>
      <li><a href="/api/health">GET /api/health</a></li>
      <li><a href="/api/analysis/variables">GET /api/analysis/variables</a></li>
    </ul>
    <p>POST <code>/api/analysis</code> with JSON like:</p>
    <pre>{
  "timeframe": "month",
  "month": "7",
  "variables": ["temperature","precipitation"],
  "thresholds": { "temperature": { "high": 35 }, "precipitation": { "high": 50 } },
  "coordinates": { "lat": -33.9249, "lon": 18.4241 },
  "trendAdjust": { "enable": true }
}</pre>
  </div>
</body>
</html>`)
})

// Silence favicon noise (optional)
app.get('/favicon.ico', (_req, res) => res.status(204).end())

/* -------------------- API routes -------------------- */


app.use('/api/auth', authRoutes)
app.use('/api/analysis', analysisRoutes)
app.use('/api/saves', savesRoutes)           // <-- keep this path


/* -------------------- API 404 + error handler -------------------- */
// 404 for unknown API routes (keep after your routers)
app.use('/api', (req, res, next) => {
  if (!res.headersSent) {
    return res.status(404).json({
      error: 'Not Found',
      path: req.originalUrl
    })
  }
  next()
})

// Centralized error handler
// If any route calls next(err) or throws, you'll get structured JSON here.
app.use((err, req, res, _next) => {
  console.error('API error:', err)
  const status = err.status || 500
  res.status(status).json({
    error: err.message || 'Server error',
    status,
    path: req.originalUrl
  })
})

/* -------------------- Start server -------------------- */
const PORT = process.env.PORT || 5050
app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`)
})
