import { Router } from 'express'
import { createUserWorkflow } from '@/bounded-contexts/identity/application/createUserWorkflow'

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
router.post('/users', async (req, res) => {
  const { username } = req.body

  // Validate required field
  if (!username || typeof username !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'Username is required and must be a string'
      }
    })
  }

  try {
    const result = await createUserWorkflow(username)

    if (result.isSuccess) {
      return res.status(201).json({
        user: result.value,
        message: 'User created successfully'
      })
    }

    // Map domain/infrastructure errors to appropriate HTTP status codes
    if (result.error.type === 'DomainFailure') {
      return res.status(400).json({
        error: result.error
      })
    }

    if (result.error.type === 'InfrastructureFailure' && result.error.subtype === 'DuplicateKey') {
      return res.status(409).json({
        error: result.error
      })
    }

    // Any other infrastructure or application errors
    return res.status(500).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'InternalError',
        message: 'An unexpected error occurred'
      }
    })

  } catch (error) {
    // Handle unexpected errors (should not happen with our Result pattern)
    console.error('Unexpected error in user creation:', error)
    return res.status(500).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'InternalError',
        message: 'An unexpected error occurred'
      }
    })
  }
})

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