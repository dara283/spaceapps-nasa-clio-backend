import { Router } from 'express'
import mysql from 'mysql2/promise'
import { authMiddleware } from './routes/auth.js'

const router = Router()

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DB,
  connectionLimit: 5
})

router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const [rows] = await pool.query(
    'SELECT id, title, payload, created_at FROM saved_items WHERE user_id=? ORDER BY id DESC',
    [userId]
  )
  res.json({ items: rows })
})

router.post('/', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const { title, payload } = req.body
  if (!payload) return res.status(400).json({ error: 'payload required' })
  const [r] = await pool.query(
    'INSERT INTO saved_items (user_id, title, payload) VALUES (?,?,?)',
    [userId, title || null, JSON.stringify(payload)]
  )
  res.json({ id: r.insertId })
})

router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id
  const id = Number(req.params.id)
  await pool.query('DELETE FROM saved_items WHERE id=? AND user_id=?', [id, userId])
  res.json({ ok: true })
})

export default router
