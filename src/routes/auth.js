// src/routes/auth.js
import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'dev-secret'
  const expiresIn = process.env.JWT_EXPIRES || '7d'
  return jwt.sign({ id: user.id, email: user.email }, secret, { expiresIn })
}

/**
 * POST /api/auth/signup
 * body: { email, password, name? }
 */
router.post(
  '/signup',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Min 6 chars')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password, name } = req.body
    try {
      // check if exists
      const [rows] = await pool.query('SELECT id FROM users WHERE email = ?', [email])
      if (rows.length) return res.status(409).json({ error: 'Email already in use' })

      const hash = await bcrypt.hash(password, 10)
      const [result] = await pool.query(
        'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
        [email, hash, name || null]
      )
      const user = { id: result.insertId, email, name: name || null }
      const token = signToken(user)
      res.json({ user, token })
    } catch (e) {
      console.error('signup error', e)
      res.status(500).json({ error: 'Server error' })
    }
  }
)

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post(
  '/login',
  [
    body('email').isEmail(),
    body('password').isString()
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password } = req.body
    try {
      const [rows] = await pool.query('SELECT id, email, password_hash, name FROM users WHERE email = ?', [email])
      if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' })

      const user = rows[0]
      const ok = await bcrypt.compare(password, user.password_hash)
      if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

      const token = signToken(user)
      res.json({ user: { id: user.id, email: user.email, name: user.name }, token })
    } catch (e) {
      console.error('login error', e)
      res.status(500).json({ error: 'Server error' })
    }
  }
)

/**
 * GET /api/auth/me
 * headers: Authorization: Bearer <token>
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = ?', [req.user.id])
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    res.json({ user: rows[0] })
  } catch (e) {
    console.error('me error', e)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
