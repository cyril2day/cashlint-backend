import { Router } from 'express'
import { generateIncomeStatementWorkflow } from '@/bounded-contexts/reporting/application/generateIncomeStatementWorkflow'
import { generateBalanceSheetWorkflow } from '@/bounded-contexts/reporting/application/generateBalanceSheetWorkflow'
import { generateStatementOfOwnersEquityWorkflow } from '@/bounded-contexts/reporting/application/generateStatementOfOwnersEquityWorkflow'
import { generateStatementOfCashFlowsWorkflow } from '@/bounded-contexts/reporting/application/generateStatementOfCashFlowsWorkflow'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

const router = Router()

/**
 * GET /api/reporting/income-statement
 * Generate an income statement for a given period.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   startDate (string) - required, ISO 8601 date string
 *   endDate (string) - required, ISO 8601 date string
 *
 * Responses:
 * - 200: Income statement generated successfully
 * - 400: Missing or invalid parameters, domain validation failure
 * - 500: Internal server error
 */
router.get('/income-statement', wrapAsyncRoute(async (req, res) => {
  const { userId, startDate, endDate } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }
  if (!startDate || typeof startDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'startDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }
  if (!endDate || typeof endDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'endDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'InvalidDate',
      message: 'startDate or endDate is not a valid date'
    })
    return
  }

  const result = await generateIncomeStatementWorkflow(userId, start, end)

  if (result.isSuccess) {
    return res.json({
      incomeStatement: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/reporting/balance-sheet
 * Generate a balance sheet as of a specific date.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   asOfDate (string) - required, ISO 8601 date string
 *
 * Responses:
 * - 200: Balance sheet generated successfully
 * - 400: Missing or invalid parameters, domain validation failure
 * - 500: Internal server error
 */
router.get('/balance-sheet', wrapAsyncRoute(async (req, res) => {
  const { userId, asOfDate } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }
  if (!asOfDate || typeof asOfDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'asOfDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }

  const date = new Date(asOfDate)
  if (isNaN(date.getTime())) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'InvalidDate',
      message: 'asOfDate is not a valid date'
    })
    return
  }

  const result = await generateBalanceSheetWorkflow(userId, date)

  if (result.isSuccess) {
    return res.json({
      balanceSheet: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/reporting/owners-equity
 * Generate a statement of owner's equity for a given period.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   startDate (string) - required, ISO 8601 date string
 *   endDate (string) - required, ISO 8601 date string
 *
 * Responses:
 * - 200: Statement generated successfully
 * - 400: Missing or invalid parameters, domain validation failure
 * - 500: Internal server error
 */
router.get('/owners-equity', wrapAsyncRoute(async (req, res) => {
  const { userId, startDate, endDate } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }
  if (!startDate || typeof startDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'startDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }
  if (!endDate || typeof endDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'endDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'InvalidDate',
      message: 'startDate or endDate is not a valid date'
    })
    return
  }

  const result = await generateStatementOfOwnersEquityWorkflow(userId, start, end)

  if (result.isSuccess) {
    return res.json({
      statementOfOwnersEquity: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/reporting/cash-flow
 * Generate a statement of cash flows for a given period.
 *
 * Query Parameters:
 *   userId (string) - required, the user's ID
 *   startDate (string) - required, ISO 8601 date string
 *   endDate (string) - required, ISO 8601 date string
 *
 * Responses:
 * - 200: Statement generated successfully
 * - 400: Missing or invalid parameters, domain validation failure
 * - 500: Internal server error
 */
router.get('/cash-flow', wrapAsyncRoute(async (req, res) => {
  const { userId, startDate, endDate } = req.query

  if (!userId || typeof userId !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'userId query parameter is required and must be a string'
    })
    return
  }
  if (!startDate || typeof startDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'startDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }
  if (!endDate || typeof endDate !== 'string') {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'MissingField',
      message: 'endDate query parameter is required and must be an ISO 8601 string'
    })
    return
  }

  const start = new Date(startDate)
  const end = new Date(endDate)
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    sendErrorResponse(res, {
      type: 'ApplicationFailure',
      subtype: 'InvalidDate',
      message: 'startDate or endDate is not a valid date'
    })
    return
  }

  const result = await generateStatementOfCashFlowsWorkflow(userId, start, end)

  if (result.isSuccess) {
    return res.json({
      statementOfCashFlows: result.value
    })
  } else {
    sendErrorResponse(res, result.error)
  }
}))

/**
 * GET /api/reporting/health
 * Health check for reporting routes.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    context: 'reporting',
    timestamp: new Date().toISOString()
  })
})

export { router as reportingRoutes }