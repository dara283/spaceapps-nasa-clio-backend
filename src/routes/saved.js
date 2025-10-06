import { Router } from 'express'
import crypto from 'node:crypto'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// In-memory saves: email -> [items]
const savedStore = new Map()

router.get('/', requireAuth, (req, res) => {
  const arr = savedStore.get(req.user.email) || []
  res.json({ items: arr })
})

router.post('/', requireAuth, (req, res) => {
  const arr = savedStore.get(req.user.email) || []
  const item = {
    id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
    ...req.body
  }
  savedStore.set(req.user.email, [item, ...arr])
  res.json({ ok: true, item })
})

router.delete('/:id', requireAuth, (req, res) => {
  const arr = savedStore.get(req.user.email) || []
  const next = arr.filter(x => x.id !== req.params.id)
  savedStore.set(req.user.email, next)
  res.json({ ok: true })
})

export default router
