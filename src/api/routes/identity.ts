import { Router } from 'express'
import { createUserWorkflow } from '@/bounded-contexts/identity/application/createUserWorkflow'
import { loginWorkflow } from '@/bounded-contexts/identity/application/loginWorkflow'
import { logoutWorkflow } from '@/bounded-contexts/identity/application/logoutWorkflow'
import { wrapAsyncRoute } from '@/common/infrastructure/errorMapper'
import { validateRequiredString } from '@/shared/fp-utils'
import { createHandler } from './handlerFactory'
import { extractSessionId } from '@/common/infrastructure/requestStrategies'
import { when, truthy, doWhen } from 'pristine-fp'

const router = Router()

// ------------------------------
// Create user route
// ------------------------------
const validateUsername = (req: any) =>
  validateRequiredString(req.body.username, 'username')

const respondWithUser = (res: any, user: any) =>
  res.status(201).json({
    user,
    message: 'User created successfully'
  })

router.post('/users', createHandler(
  validateUsername,
  createUserWorkflow,
  respondWithUser
))

// ------------------------------
// Login route
// ------------------------------
const respondWithTokenAndCookie = (res: any, sessionId: string) => {
  res.cookie('sessionId', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000, // 1 hour
  })
  return res.status(200).json({
    token: sessionId,
    message: 'Login successful'
  })
}

router.post('/login', createHandler(
  validateUsername,
  loginWorkflow,
  respondWithTokenAndCookie
))

// ------------------------------
// Logout route (custom because sessionId is optional)
// ------------------------------
router.post('/logout', wrapAsyncRoute(async (req, res) => {
  const sessionId = extractSessionId(req)

  // Perform logout only when a sessionId exists
  const maybeLogout = when(truthy(sessionId), () => logoutWorkflow(sessionId as string))
  doWhen(truthy(maybeLogout), async () => await maybeLogout)

  // Clear cookie regardless (safe operation)
  res.clearCookie('sessionId')

  return res.status(200).json({ message: 'Logged out successfully' })
}))

// ------------------------------
// Health check
// ------------------------------
router.get('/users/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'identity',
    timestamp: new Date().toISOString()
  })
})

export { router as identityRoutes }