// src/middleware/requireAuth.js
import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  try {
    const hdr = req.headers.authorization || ''
    const [type, token] = hdr.split(' ')
    if (type !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' })
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
    req.user = { id: payload.id, email: payload.email }
    next()
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
