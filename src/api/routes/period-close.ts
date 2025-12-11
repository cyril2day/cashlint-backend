import { Router } from 'express'
import { createPeriodWorkflow, CreatePeriodCommand } from '@/bounded-contexts/period-close/application/createPeriodWorkflow'
import { closePeriodWorkflow, ClosePeriodCommand } from '@/bounded-contexts/period-close/application/closePeriodWorkflow'
import { postManualJournalEntryWorkflow, PostManualJournalEntryCommand } from '@/bounded-contexts/period-close/application/postManualJournalEntryWorkflow'
import { listPeriods } from '@/bounded-contexts/period-close/infrastructure/periodRepo'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

const router = Router()

/**
 * POST /api/period-close/periods
 * Create a new accounting period (month/quarter/year) for a user.
 *
 * Request Body:
 * {
 *   "userId": "string" (required, UUID),
 *   "name": "string" (required, 1-100 characters, e.g., "January 2025"),
 *   "startDate": "string" (required, ISO 8601),
 *   "endDate": "string" (required, ISO 8601, must be after startDate)
 * }
 *
 * Responses:
 * - 201: Period created successfully
 * - 400: Validation error (domain failure)
 * - 409: Duplicate period name for the same user
 * - 500: Internal server error
 */
router.post('/periods', wrapAsyncRoute(async (req, res) => {
  const { userId, name, startDate, endDate } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!name || typeof name !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'name is required and must be a string'
    })
    return
  }
  if (!startDate || typeof startDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'startDate is required and must be an ISO string'
    })
    return
  }
  if (!endDate || typeof endDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'endDate is required and must be an ISO string'
    })
    return
  }

  const command: CreatePeriodCommand = { userId, name, startDate, endDate }
  const result = await createPeriodWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      period: result.value,
      message: 'Period created successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/period-close/periods
 * List periods for a user, optionally filtered by status.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   status (string, optional) - 'Open' or 'Closed'
 *
 * Responses:
 * - 200: List of periods
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/periods', wrapAsyncRoute(async (req, res) => {
  const { userId, status } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const filters = status && (status === 'Open' || status === 'Closed')
    ? { status: status as 'Open' | 'Closed' }
    : undefined

  const result = await listPeriods(userId, filters)

  if (result.isSuccess) {
    return res.json({
      periods: result.value,
      count: result.value.length
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/period-close/periods/:periodId/close
 * Close an open period.
 *
 * Path Parameters:
 *   periodId (string) - required, the period's ID
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Period closed successfully
 * - 400: Missing userId, invalid periodId
 * - 404: Period not found
 * - 409: Period already closed
 * - 500: Internal server error
 */
router.post('/periods/:periodId/close', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query
  const { periodId } = req.params

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }
  if (!periodId || typeof periodId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'periodId path parameter is required'
    })
    return
  }

  const command: ClosePeriodCommand = { userId, periodId }
  const result = await closePeriodWorkflow(command)

  if (result.isSuccess) {
    return res.json({
      period: result.value,
      message: 'Period closed successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/period-close/manual-journal-entries
 * Post a manual adjusting journal entry (only allowed within open periods).
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "entryNumber": "string" (optional),
 *   "description": "string",
 *   "date": "string" (ISO 8601),
 *   "lines": [
 *     {
 *       "accountId": "string",
 *       "amount": number (positive),
 *       "side": "Debit" | "Credit"
 *     }
 *   ]
 * }
 *
 * Responses:
 * - 201: Manual journal entry posted successfully
 * - 400: Validation error (domain failure, e.g., date not in open period)
 * - 404: Account not found, etc.
 * - 500: Internal server error
 */
router.post('/manual-journal-entries', wrapAsyncRoute(async (req, res) => {
  const { userId, entryNumber, description, date, lines } = req.body

  // Basic validation (similar to ledger journal entry)
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!description || typeof description !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'description is required and must be a string'
    })
    return
  }
  if (!date || typeof date !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'date is required and must be an ISO string'
    })
    return
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'lines must be a non‑empty array'
    })
    return
  }
  for (const line of lines) {
    if (!line.accountId || typeof line.accountId !== 'string' ||
        typeof line.amount !== 'number' || line.amount <= 0 ||
        !['Debit', 'Credit'].includes(line.side)) {
      sendErrorResponse(res, {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'Each line must have accountId (string), amount (positive number), and side ("Debit" or "Credit")'
      })
      return
    }
  }

  const command: PostManualJournalEntryCommand = { userId, entryNumber, description, date, lines }
  const result = await postManualJournalEntryWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      journalEntry: result.value,
      message: 'Manual journal entry posted successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/period-close/health
 * Health check for period-close routes.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'period-close',
    timestamp: new Date().toISOString()
  })
})

export { router as periodCloseRoutes }