import { Router } from 'express'
import { createVendorWorkflow, CreateVendorCommand } from '@/bounded-contexts/purchasing/application/createVendorWorkflow'
import { recordVendorBillWorkflow, RecordVendorBillCommand } from '@/bounded-contexts/purchasing/application/recordVendorBillWorkflow'
import { recordLoanPaymentWorkflow, RecordLoanPaymentCommand } from '@/bounded-contexts/purchasing/application/recordLoanPaymentWorkflow'
import { recordCashExpenseWorkflow, RecordCashExpenseCommand } from '@/bounded-contexts/purchasing/application/recordCashExpenseWorkflow'
import { listVendors, findVendorById } from '@/bounded-contexts/purchasing/infrastructure/vendorRepo'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

const router = Router()

/**
 * POST /api/purchasing/vendors
 * Create a new vendor.
 *
 * Request Body:
 * {
 *   "userId": "string" (required, UUID of the user),
 *   "name": "string" (required, vendor name),
 *   "email": "string" (optional, email address)
 * }
 *
 * Responses:
 * - 201: Vendor created successfully
 * - 400: Validation error (domain failure)
 * - 409: Duplicate vendor name (if uniqueness is enforced)
 * - 500: Internal server error
 */
router.post('/vendors', wrapAsyncRoute(async (req, res) => {
  const { userId, name, email } = req.body

  // Basic validation of required fields
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

  const command: CreateVendorCommand = { userId, name, email }
  const result = await createVendorWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      vendor: result.value,
      message: 'Vendor created successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/purchasing/vendors
 * List vendors for a user.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *
 * Responses:
 * - 200: List of vendors
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/vendors', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const result = await listVendors(userId)

  if (result.isSuccess) {
    return res.json({
      vendors: result.value,
      count: result.value.length
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/purchasing/vendors/:vendorId
 * Retrieve a specific vendor by ID.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Vendor found
 * - 400: Missing or invalid userId
 * - 404: Vendor not found
 * - 500: Internal server error
 */
router.get('/vendors/:vendorId', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query
  const { vendorId } = req.params

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const result = await findVendorById(userId, vendorId)

  if (result.isSuccess) {
    if (result.value === null) {
      sendErrorResponse(res, {
        type: 'DomainFailure',
        subtype: 'VendorNotFound',
        message: `Vendor ${vendorId} not found or does not belong to the user`
      })
      return
    }
    return res.json({
      vendor: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/purchasing/vendor-bills
 * Record a vendor bill (credit purchase).
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "vendorId": "string",
 *   "billNumber": "string" (unique identifier for the bill),
 *   "amount": number (positive, up to 2 decimal places),
 *   "date": "string" (ISO 8601),
 *   "dueDate": "string" (ISO 8601, optional),
 *   "description": "string" (optional)
 * }
 *
 * Responses:
 * - 201: Vendor bill recorded successfully
 * - 400: Validation error (domain failure)
 * - 404: Vendor not found
 * - 500: Internal server error
 */
router.post('/vendor-bills', wrapAsyncRoute(async (req, res) => {
  const { userId, vendorId, billNumber, amount, date, dueDate, description } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!vendorId || typeof vendorId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'vendorId is required and must be a string'
    })
    return
  }
  if (!billNumber || typeof billNumber !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'billNumber is required and must be a string'
    })
    return
  }
  if (typeof amount !== 'number' || amount <= 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'amount must be a positive number'
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

  const command: RecordVendorBillCommand = { userId, vendorId, billNumber, amount, date, dueDate, description }
  const result = await recordVendorBillWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      bill: result.value,
      message: 'Vendor bill recorded successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/purchasing/loan-payments
 * Record a loan payment (split between principal and interest).
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "vendorId": "string",
 *   "principalAmount": number (positive, up to 2 decimal places),
 *   "interestAmount": number (non‑negative, up to 2 decimal places),
 *   "date": "string" (ISO 8601),
 *   "description": "string" (optional)
 * }
 *
 * Responses:
 * - 201: Loan payment recorded successfully
 * - 400: Validation error (domain failure)
 * - 404: Vendor or loan not found
 * - 500: Internal server error
 */
router.post('/loan-payments', wrapAsyncRoute(async (req, res) => {
  const { userId, vendorId, principalAmount, interestAmount, date, description } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!vendorId || typeof vendorId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'vendorId is required and must be a string'
    })
    return
  }
  if (typeof principalAmount !== 'number' || principalAmount <= 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'principalAmount must be a positive number'
    })
    return
  }
  if (typeof interestAmount !== 'number' || interestAmount < 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'interestAmount must be a non‑negative number'
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

  const command: RecordLoanPaymentCommand = { userId, vendorId, principalAmount, interestAmount, date, description }
  const result = await recordLoanPaymentWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      loanPayment: result.value,
      message: 'Loan payment recorded successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/purchasing/cash-expenses
 * Record a cash expense (paid immediately).
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "vendorId": "string" (required, vendor ID; use a special vendor for "Various Suppliers"),
 *   "amount": number (positive, up to 2 decimal places),
 *   "date": "string" (ISO 8601),
 *   "expenseCategory": "string" (required, e.g., "Supplies", "Rent", etc.),
 *   "description": "string" (optional)
 * }
 *
 * Responses:
 * - 201: Cash expense recorded successfully
 * - 400: Validation error (domain failure)
 * - 404: Vendor not found
 * - 500: Internal server error
 */
router.post('/cash-expenses', wrapAsyncRoute(async (req, res) => {
  const { userId, vendorId, amount, date, expenseCategory, description } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!vendorId || typeof vendorId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'vendorId is required and must be a string'
    })
    return
  }
  if (typeof amount !== 'number' || amount <= 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'amount must be a positive number'
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
  if (!expenseCategory || typeof expenseCategory !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'expenseCategory is required and must be a string'
    })
    return
  }

  const command: RecordCashExpenseCommand = { userId, vendorId, amount, date, expenseCategory, description }
  const result = await recordCashExpenseWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      cashExpense: result.value,
      message: 'Cash expense recorded successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/purchasing/health
 * Health check for purchasing routes.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'purchasing',
    timestamp: new Date().toISOString()
  })
})

export { router as purchasingRoutes }