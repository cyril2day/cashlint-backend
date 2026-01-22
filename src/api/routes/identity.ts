import { Router } from 'express'
import { createUserWorkflow } from '@/bounded-contexts/identity/application/createUserWorkflow'
import { loginWorkflow } from '@/bounded-contexts/identity/application/loginWorkflow'
import { logoutWorkflow } from '@/bounded-contexts/identity/application/logoutWorkflow'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'
import { validateRequiredString } from '@/shared/fp-utils'

const router = Router()

/**
 * POST /api/users
 * Create a new user with a unique username
 *
 * Request Body:
 * {
 *   "username": "string" (required, alphanumeric + underscores, min 3 chars, case-insensitive)
 * }
 *
 * Responses:
 * - 201: User created successfully
 * - 400: Invalid username (domain validation failed)
 * - 409: Username already exists
 * - 500: Internal server error
 */
router.post('/users', wrapAsyncRoute(async (req, res) => {
  const { username } = req.body

  // Validate required field using functional helper
  const validationResult = validateRequiredString(username, 'username')
  if (!validationResult.isSuccess) {
    sendErrorResponse(res, validationResult.error)
    return
  }

  const result = await createUserWorkflow(validationResult.value)

  if (result.isSuccess) {
    return res.status(201).json({
      user: result.value,
      message: 'User created successfully'
    })
  }

  // Use centralized error mapping
  sendErrorResponse(res, result.error)
}))

/**
 * POST /api/login
 * Authenticate a user by username and create a session
 *
 * Request Body:
 * {
 *   "username": "string" (required, alphanumeric + underscores, min 3 chars, case-insensitive)
 * }
 *
 * Responses:
 * - 200: Login successful, session cookie set
 * - 400: Invalid username (domain validation failed)
 * - 404: User not found
 * - 500: Internal server error
 */
router.post('/login', wrapAsyncRoute(async (req, res) => {
  const { username } = req.body

  // Validate required field using functional helper
  const validationResult = validateRequiredString(username, 'username')
  if (!validationResult.isSuccess) {
    sendErrorResponse(res, validationResult.error)
    return
  }

  const result = await loginWorkflow(validationResult.value)

  if (result.isSuccess) {
    const session = result.value
    // Set HTTP-only cookie with session ID
    res.cookie('sessionId', session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
    })
    return res.status(200).json({
      session,
      message: 'Login successful'
    })
  }

  // Use centralized error mapping
  sendErrorResponse(res, result.error)
}))

/**
 * POST /api/logout
 * Log out the current user by deleting the session and clearing the cookie.
 * If no session cookie is present, still returns success.
 */
router.post('/logout', wrapAsyncRoute(async (req, res) => {
  const sessionId = req.cookies?.sessionId

  if (sessionId && typeof sessionId === 'string') {
    // Attempt to delete the session; ignore any errors (session may already be gone)
    await logoutWorkflow(sessionId)
  }

  // Clear the session cookie regardless
  res.clearCookie('sessionId')

  return res.status(200).json({
    message: 'Logged out successfully'
  })
}))

/**
 * GET /api/users/health
 * Health check for identity routes
 */
router.get('/users/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'identity',
    timestamp: new Date().toISOString()
  })
})

export { router as identityRoutes }