import { AppError } from '../types/errors'

/**
 * Maps an AppError to an HTTP response status and body.
 * This is a pure function that centralizes the mapping logic.
 */
export const mapErrorToResponse = (error: AppError): { status: number; body: any } => {
  switch (error.type) {
    case 'DomainFailure':
      // Business rule violations, validation errors, etc.
      // Some domain failures represent missing resources and should be 404
      // Duplicate errors should be 409 Conflict
      switch (error.subtype) {
        case 'AccountNotFound':
        case 'CustomerNotFound':
        case 'InvoiceNotFound':
        case 'JournalEntryNotFound':
        case 'UserNotFound':
        case 'VendorNotFound':
        case 'BillNotFound':
        case 'LoanNotFound':
        case 'PeriodNotFound':
        case 'MissingCapitalAccount':
        case 'MissingDrawingAccount':
        case 'CashAccountNotFound':
          return {
            status: 404, // Not Found
            body: { error }
          }
        case 'DuplicateInvoiceNumber':
        case 'DuplicateAccountCode':
        case 'DuplicateBillNumber':
          return {
            status: 409, // Conflict
            body: { error }
          }
        default:
          return {
            status: 400, // Bad Request
            body: { error }
          }
      }

    case 'ApplicationFailure':
      // Invalid API usage, missing payload, etc.
      return {
        status: 400, // Bad Request (or 422 Unprocessable Entity)
        body: { error }
      }

    case 'InfrastructureFailure':
      // Database errors, network failures, etc.
      switch (error.subtype) {
        case 'DuplicateKey':
          return {
            status: 409, // Conflict
            body: { error }
          }
        case 'AccountNotFound':
        case 'CustomerNotFound':
        case 'InvoiceNotFound':
        case 'JournalEntryNotFound':
        case 'UserNotFound':
          return {
            status: 404, // Not Found
            body: { error }
          }
        default:
          // For other infrastructure errors, do not expose originalError to client
          return {
            status: 500, // Internal Server Error
            body: {
              error: {
                type: 'InfrastructureFailure',
                subtype: error.subtype,
                message: 'Internal server error'
              }
            }
          }
      }

    default:
      // Fallback for unknown error types (should not happen)
      return {
        status: 500,
        body: {
          error: {
            type: 'InfrastructureFailure',
            subtype: 'UnknownError',
            message: 'An unexpected error occurred'
          }
        }
      }
  }
}

/**
 * Helper to send an error response using Express's res object.
 * This is an impure function (side effect: sending HTTP response).
 */
export const sendErrorResponse = (res: any, error: AppError): void => {
  const { status, body } = mapErrorToResponse(error)
  res.status(status).json(body)
}

/**
 * Higher-order function that wraps an async route handler to catch errors and map them.
 * Usage: wrapAsyncRoute(myHandler)
 */
export const wrapAsyncRoute = (handler: (req: any, res: any) => Promise<any>) =>
  async (req: any, res: any): Promise<void> => {
    try {
      await handler(req, res)
    } catch (error: any) {
      // This catches unexpected errors (non-Result errors) and maps them to a generic 500.
      const infrastructureError: AppError = {
        type: 'InfrastructureFailure',
        subtype: 'UnexpectedError',
        message: error?.message || 'An unexpected error occurred',
        originalError: error
      }
      sendErrorResponse(res, infrastructureError)
    }
  }