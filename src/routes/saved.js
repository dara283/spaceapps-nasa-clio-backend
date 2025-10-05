// src/routes/saved.js
import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/saved
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, location, time_desc AS timeDesc, variables_json AS variablesJson, thresholds_json AS thresholdsJson, analysis_json AS analysisJson, created_at AS createdAt FROM saved_items WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    )
    // Parse JSON columns for client
    const items = rows.map(r => ({
      id: r.id,
      location: r.location,
      timeDesc: r.timeDesc,
      variables: JSON.parse(r.variablesJson),
      thresholds: JSON.parse(r.thresholdsJson),
      analysisData: JSON.parse(r.analysisJson),
      createdAt: r.createdAt
    }))
    res.json({ items })
  } catch (e) {
    console.error('list saved error', e)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/saved
router.post(
  '/',
  requireAuth,
  [
    body('location').isString().notEmpty(),
    body('timeDesc').isString().notEmpty(),
    body('variables').isArray({ min: 1 }),
    body('thresholds').isObject(),
    body('analysisData').isObject()
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { location, timeDesc, variables, thresholds, analysisData } = req.body
    try {
      const [result] = await pool.query(
        `INSERT INTO saved_items (user_id, location, time_desc, variables_json, thresholds_json, analysis_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          location,
          timeDesc,
          JSON.stringify(variables),
          JSON.stringify(thresholds),
          JSON.stringify(analysisData)
        ]
      )
      res.json({ ok: true, id: result.insertId })
    } catch (e) {
      console.error('save item error', e)
      res.status(500).json({ error: 'Server error' })
    }
  }
)

// DELETE /api/saved/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params
    const [result] = await pool.query('DELETE FROM saved_items WHERE id = ? AND user_id = ?', [id, req.user.id])
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Item not found' })
    res.json({ ok: true })
  } catch (e) {
    console.error('delete item error', e)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
