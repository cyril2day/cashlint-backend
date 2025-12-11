import { Router } from 'express'
import { createCustomerWorkflow, CreateCustomerCommand } from '@/bounded-contexts/sales/application/createCustomerWorkflow'
import { issueSalesInvoiceWorkflow, IssueSalesInvoiceCommand } from '@/bounded-contexts/sales/application/issueSalesInvoiceWorkflow'
import { applyPaymentToInvoiceWorkflow, ApplyPaymentToInvoiceCommand } from '@/bounded-contexts/sales/application/applyPaymentToInvoiceWorkflow'
import { listCustomers, findCustomerById } from '@/bounded-contexts/sales/infrastructure/customerRepo'
import { listSalesInvoices, findSalesInvoiceById } from '@/bounded-contexts/sales/infrastructure/salesInvoiceRepo'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

const router = Router()

/**
 * POST /api/sales/customers
 * Create a new customer.
 *
 * Request Body:
 * {
 *   "userId": "string" (required, UUID of the user),
 *   "name": "string" (required, customer name),
 *   "email": "string" (optional, email address)
 * }
 *
 * Responses:
 * - 201: Customer created successfully
 * - 400: Validation error (domain failure)
 * - 409: Duplicate customer name (if we decide to enforce uniqueness, but not in v1)
 * - 500: Internal server error
 */
router.post('/customers', wrapAsyncRoute(async (req, res) => {
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

  const command: CreateCustomerCommand = { userId, name, email }
  const result = await createCustomerWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      customer: result.value,
      message: 'Customer created successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/sales/invoices
 * Issue a new sales invoice.
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "customerId": "string",
 *   "invoiceNumber": "string",
 *   "total": number (positive, up to 2 decimal places),
 *   "date": "string" (ISO 8601),
 *   "dueDate": "string" (ISO 8601, optional),
 *   "description": "string" (optional)
 * }
 *
 * Responses:
 * - 201: Invoice issued successfully
 * - 400: Validation error (domain failure)
 * - 404: Customer not found
 * - 409: Duplicate invoice number
 * - 500: Internal server error
 */
router.post('/invoices', wrapAsyncRoute(async (req, res) => {
  const { userId, customerId, invoiceNumber, total, date, dueDate, description } = req.body

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
    })
    return
  }
  if (!customerId || typeof customerId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'customerId is required and must be a string'
    })
    return
  }
  if (!invoiceNumber || typeof invoiceNumber !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'invoiceNumber is required and must be a string'
    })
    return
  }
  if (typeof total !== 'number' || total <= 0) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'total must be a positive number'
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

  const command: IssueSalesInvoiceCommand = { userId, customerId, invoiceNumber, total, date, dueDate, description }
  const result = await issueSalesInvoiceWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      invoice: result.value,
      message: 'Invoice issued successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/sales/customers
 * List customers for a user.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *
 * Responses:
 * - 200: List of customers
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/customers', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const result = await listCustomers(userId)

  if (result.isSuccess) {
    return res.json({
      customers: result.value,
      count: result.value.length
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/sales/customers/:customerId
 * Retrieve a specific customer by ID.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Customer found
 * - 400: Missing or invalid userId
 * - 404: Customer not found
 * - 500: Internal server error
 */
router.get('/customers/:customerId', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query
  const { customerId } = req.params

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const result = await findCustomerById(userId, customerId)

  if (result.isSuccess) {
    if (result.value === null) {
      sendErrorResponse(res, {
        type: 'DomainFailure',
        subtype: 'CustomerNotFound',
        message: `Customer ${customerId} not found or does not belong to the user`
      })
      return
    }
    return res.json({
      customer: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/sales/invoices
 * List sales invoices for a user, ordered by date descending.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   skip (number, optional) - pagination offset
 *   take (number, optional) - pagination limit
 *
 * Responses:
 * - 200: List of invoices
 * - 400: Missing or invalid userId
 * - 500: Internal server error
 */
router.get('/invoices', wrapAsyncRoute(async (req, res) => {
  const { userId, skip, take } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
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

  const result = await listSalesInvoices(userId, options)

  if (result.isSuccess) {
    return res.json({
      invoices: result.value,
      count: result.value.length
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/sales/invoices/:invoiceId
 * Retrieve a specific sales invoice by ID.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID (for isolation)
 *
 * Responses:
 * - 200: Invoice found
 * - 400: Missing or invalid userId
 * - 404: Invoice not found
 * - 500: Internal server error
 */
router.get('/invoices/:invoiceId', wrapAsyncRoute(async (req, res) => {
  const { userId } = req.query
  const { invoiceId } = req.params

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }

  const result = await findSalesInvoiceById(userId, invoiceId)

  if (result.isSuccess) {
    if (result.value === null) {
      sendErrorResponse(res, {
        type: 'DomainFailure',
        subtype: 'InvoiceNotFound',
        message: `Invoice ${invoiceId} not found or does not belong to the user`
      })
      return
    }
    return res.json({
      invoice: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/sales/invoices/:invoiceId/payments
 * Apply a payment to an invoice.
 *
 * Request Body:
 * {
 *   "userId": "string",
 *   "amount": number (positive, up to 2 decimal places),
 *   "date": "string" (ISO 8601),
 *   "method": "string" (Cash, Check, CreditCard, BankTransfer),
 *   "reference": "string" (optional)
 * }
 *
 * Responses:
 * - 201: Payment applied successfully
 * - 400: Validation error (domain failure)
 * - 404: Invoice not found
 * - 500: Internal server error
 */
router.post('/invoices/:invoiceId/payments', wrapAsyncRoute(async (req, res) => {
  const { userId, amount, date, method, reference } = req.body
  const { invoiceId } = req.params

  // Basic validation
  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId is required and must be a string'
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
  if (!method || typeof method !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'method is required and must be a string'
    })
    return
  }

  const command: ApplyPaymentToInvoiceCommand = { userId, invoiceId, amount, date, method, reference }
  const result = await applyPaymentToInvoiceWorkflow(command)

  if (result.isSuccess) {
    return res.status(201).json({
      payment: result.value,
      message: 'Payment applied successfully'
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * POST /api/sales/cash-sales
 * Record a cash sale (revenue earned and cash received at the same time).
 * TODO: Implement this endpoint when the workflow is ready.
 */
router.post('/cash-sales', async (req, res) => {
  // Placeholder for future implementation
  return res.status(501).json({
    error: {
      type: 'ApplicationFailure',
      subtype: 'NotImplemented',
      message: 'Record cash sale endpoint is not yet implemented'
    }
  })
})

/**
 * POST /api/sales/customer-deposits
 * Record a customer deposit (unearned revenue).
 * TODO: Implement this endpoint when the workflow is ready.
 */
router.post('/customer-deposits', async (req, res) => {
  // Placeholder for future implementation
  return res.status(501).json({
    error: {
      type: 'ApplicationFailure',
      subtype: 'NotImplemented',
      message: 'Record customer deposit endpoint is not yet implemented'
    }
  })
})

/**
 * GET /api/sales/health
 * Health check for sales routes.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'sales',
    timestamp: new Date().toISOString()
  })
})

export { router as salesRoutes }