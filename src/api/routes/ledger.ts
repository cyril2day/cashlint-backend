import { Router } from 'express'
import { createAccountWorkflow } from '@/bounded-contexts/ledger/application/createAccountWorkflow'
import { postJournalEntryWorkflow } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'
import { CreateAccountCommand } from '@/bounded-contexts/ledger/application/createAccountWorkflow'
import { PostJournalEntryCommand } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'
import { listAccounts, findAccountById } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { listJournalEntries, findJournalEntryById } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'

const router = Router()

/**
 * POST /api/ledger/accounts
 * Create a new account in the user's chart of accounts.
 * 
 * Request Body:
 * {
 *   "userId": "string" (required, UUID of the user),
 *   "code": "string" (required, account code, e.g., "101"),
 *   "name": "string" (required, account name),
 *   "type": "Asset" | "Liability" | "Equity" | "Revenue" | "Expense",
 *   "normalBalance": "Debit" | "Credit"
 * }
 * 
 * Responses:
 * - 201: Account created successfully
 * - 400: Validation error (domain failure)
 * - 409: Duplicate account code
 * - 500: Internal server error
 */
router.post('/accounts', async (req, res) => {
  const { userId, code, name, type, normalBalance } = req.body

  // Basic validation of required fields
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId is required and must be a string'
      }
    })
  }
  if (!code || typeof code !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'code is required and must be a string'
      }
    })
  }
  if (!name || typeof name !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'name is required and must be a string'
      }
    })
  }
  if (!type || !['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].includes(type)) {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'type is required and must be one of: Asset, Liability, Equity, Revenue, Expense'
      }
    })
  }
  if (!normalBalance || !['Debit', 'Credit'].includes(normalBalance)) {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'normalBalance is required and must be Debit or Credit'
      }
    })
  }

  try {
    const command: CreateAccountCommand = { userId, code, name, type, normalBalance }
    const result = await createAccountWorkflow(command)

    if (result.isSuccess) {
      return res.status(201).json({
        account: result.value,
        message: 'Account created successfully'
      })
    } else {
      // Map domain/infrastructure errors to appropriate HTTP status codes
      if (result.error.type === 'DomainFailure') {
        if (result.error.subtype === 'DuplicateAccountCode') {
          return res.status(409).json({
            error: result.error
          })
        }
        return res.status(400).json({
          error: result.error
        })
      }

      // Infrastructure errors (e.g., database connection) -> 500
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    // Unexpected errors (should not happen with our Result pattern)
    console.error('Unexpected error in account creation:', error)
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
 * POST /api/ledger/journal-entries
 * Post a new journal entry (double‑entry).
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
 * - 201: Journal entry posted successfully
 * - 400: Validation error (domain failure, e.g., unbalanced, missing account)
 * - 404: One or more accounts not found
 * - 500: Internal server error
 */
router.post('/journal-entries', async (req, res) => {
  const { userId, entryNumber, description, date, lines } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId is required and must be a string'
      }
    })
  }
  if (!description || typeof description !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'description is required and must be a string'
      }
    })
  }
  if (!date || typeof date !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'date is required and must be an ISO string'
      }
    })
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'lines must be a non‑empty array'
      }
    })
  }
  for (const line of lines) {
    if (!line.accountId || typeof line.accountId !== 'string' ||
        typeof line.amount !== 'number' || line.amount <= 0 ||
        !['Debit', 'Credit'].includes(line.side)) {
      return res.status(400).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'MissingField',
          message: 'Each line must have accountId (string), amount (positive number), and side ("Debit" or "Credit")'
        }
      })
    }
  }

  try {
    const command: PostJournalEntryCommand = { userId, entryNumber, description, date, lines }
    const result = await postJournalEntryWorkflow(command)

    if (result.isSuccess) {
      return res.status(201).json({
        journalEntry: result.value,
        message: 'Journal entry posted successfully'
      })
    } else {
      // Map domain/infrastructure errors
      if (result.error.type === 'DomainFailure') {
        // AccountNotFound is a domain failure in our workflow
        if (result.error.subtype === 'AccountNotFound') {
          return res.status(404).json({
            error: result.error
          })
        }
        return res.status(400).json({
          error: result.error
        })
      }

      // Infrastructure errors
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    console.error('Unexpected error in journal entry posting:', error)
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
 * GET /api/ledger/accounts
 * List accounts for a user.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *
 * Responses:
 * - 200: List of accounts
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/accounts', async (req, res) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId query parameter is required and must be a string'
      }
    })
  }

  try {
    const result = await listAccounts(userId)

    if (result.isSuccess) {
      return res.json({
        accounts: result.value,
        count: result.value.length
      })
    } else {
      // Infrastructure error
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    console.error('Unexpected error in listing accounts:', error)
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
 * GET /api/ledger/accounts/:accountId
 * Retrieve a specific account by ID.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Account found
 * - 400: Missing or invalid userId
 * - 404: Account not found
 * - 500: Internal server error
 */
router.get('/accounts/:accountId', async (req, res) => {
  const { userId } = req.query
  const { accountId } = req.params

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId query parameter is required and must be a string'
      }
    })
  }

  try {
    const result = await findAccountById(userId, accountId)

    if (result.isSuccess) {
      if (result.value === null) {
        return res.status(404).json({
          error: {
            type: 'DomainFailure',
            subtype: 'AccountNotFound',
            message: `Account ${accountId} not found or does not belong to the user`
          }
        })
      }
      return res.json({
        account: result.value
      })
    } else {
      // Infrastructure error
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    console.error('Unexpected error in fetching account:', error)
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
 * GET /api/ledger/journal-entries
 * List journal entries for a user, ordered by date descending.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   skip (number, optional) - pagination offset
 *   take (number, optional) - pagination limit
 *
 * Responses:
 * - 200: List of journal entries
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/journal-entries', async (req, res) => {
  const { userId, skip, take } = req.query

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId query parameter is required and must be a string'
      }
    })
  }

  const options: { skip?: number; take?: number } = {}
  if (skip !== undefined) {
    const parsed = parseInt(skip as string, 10)
    if (!isNaN(parsed) && parsed >= 0) {
      options.skip = parsed
    }
  }
  if (take !== undefined) {
    const parsed = parseInt(take as string, 10)
    if (!isNaN(parsed) && parsed > 0) {
      options.take = parsed
    }
  }

  try {
    const result = await listJournalEntries(userId, options)

    if (result.isSuccess) {
      return res.json({
        journalEntries: result.value,
        count: result.value.length
      })
    } else {
      // Infrastructure error
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    console.error('Unexpected error in listing journal entries:', error)
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
 * GET /api/ledger/journal-entries/:entryId
 * Retrieve a specific journal entry by ID.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Journal entry found
 * - 400: Missing or invalid userId
 * - 404: Journal entry not found
 * - 500: Internal server error
 */
router.get('/journal-entries/:entryId', async (req, res) => {
  const { userId } = req.query
  const { entryId } = req.params

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingField',
        message: 'userId query parameter is required and must be a string'
      }
    })
  }

  try {
    const result = await findJournalEntryById(userId, entryId)

    if (result.isSuccess) {
      if (result.value === null) {
        return res.status(404).json({
          error: {
            type: 'DomainFailure',
            subtype: 'JournalEntryNotFound',
            message: `Journal entry ${entryId} not found or does not belong to the user`
          }
        })
      }
      return res.json({
        journalEntry: result.value
      })
    } else {
      // Infrastructure error
      return res.status(500).json({
        error: {
          type: 'ApplicationFailure',
          subtype: 'InternalError',
          message: 'An unexpected error occurred'
        }
      })
    }
  } catch (error) {
    console.error('Unexpected error in fetching journal entry:', error)
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
 * GET /api/ledger/health
 * Health check for ledger routes.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'ledger',
    timestamp: new Date().toISOString()
  })
})

export { router as ledgerRoutes }