// 1. The Unified Error Type (Value)
export type AppError = 
  | { type: 'DomainFailure', subtype: string, message: string }
  | { type: 'InfrastructureFailure', subtype: string, message: string, originalError?: any }
  | { type: 'ApplicationFailure', subtype: string, message: string }

// 2. Factories for creating specific Failure types

/**
 * Creates a DomainFailure (e.g., business rule violation, bad input).
 * These errors originate from the Pure Core.
 */
export const DomainFailure = (
  subtype: string, 
  message: string
): AppError => ({
  type: 'DomainFailure',
  subtype,
  message
})

/**
 * Creates an InfrastructureFailure (e.g., database connection error, unique constraint violation).
 * These errors originate from the Impure Shell (I/O).
 */
export const InfrastructureFailure = (
  subtype: string, 
  message: string, 
  originalError?: any
): AppError => ({
  type: 'InfrastructureFailure',
  subtype,
  message,
  originalError
})

/**
 * Creates an ApplicationFailure (e.g., invalid API usage, missing required payload).
 * These errors originate from the API/Interface layer.
 */
export const ApplicationFailure = (
  subtype: string, 
  message: string
): AppError => ({
  type: 'ApplicationFailure',
  subtype,
  message
})