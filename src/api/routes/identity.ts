import { Router } from 'express'
import { createUserWorkflow } from '@/bounded-contexts/identity/application/createUserWorkflow'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

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

  // Validate required field
  if (!username || typeof username !== 'string') {
    const error = {
      type: 'ApplicationFailure' as const,
      subtype: 'MissingField' as const,
      message: 'Username is required and must be a string'
    }
    sendErrorResponse(res, error)
    return
  }

  const result = await createUserWorkflow(username)

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