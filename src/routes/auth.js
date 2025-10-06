import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// In-memory users { email -> { email, name, hash } }
const users = new Map()

function makeToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name || '' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '7d' }
  )
}

router.post(
  '/signup',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Min password length is 6'),
    body('name').optional().isString()
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password, name = '' } = req.body
    if (users.has(email)) return res.status(400).json({ error: 'Account already exists' })

    const hash = await bcrypt.hash(password, 10)
    const user = { email, name, hash }
    users.set(email, user)

    const token = makeToken(user)
    return res.json({ token, user: { email, name } })
  }
)

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isString().notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { email, password } = req.body
    const user = users.get(email)
    if (!user) return res.status(400).json({ error: 'Invalid credentials' })

    const ok = await bcrypt.compare(password, user.hash)
    if (!ok) return res.status(400).json({ error: 'Invalid credentials' })

    const token = makeToken(user)
    return res.json({ token, user: { email, name: user.name || '' } })
  }
)

// Example protected route (optional)
router.get('/me', requireAuth, (req, res) => {
  const u = users.get(req.user.email)
  if (!u) return res.status(404).json({ error: 'User not found' })
  return res.json({ user: { email: u.email, name: u.name || '' } })
})

export default router
