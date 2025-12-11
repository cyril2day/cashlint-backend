// PeriodClose-specific error subtypes
export type PeriodCloseDomainSubtype =
  | 'InvalidPeriodName'
  | 'InvalidPeriodDateRange'
  | 'PeriodNotFound'
  | 'PeriodAlreadyClosed'
  | 'PeriodNotOpen'
  | 'CannotModifyClosedPeriod'
  | 'InvalidManualJournalEntry'

export type PeriodCloseInfrastructureSubtype =
  | 'PeriodRepositoryError'
  | 'DatabaseConnectionError'
  | 'DuplicateKey'

export type PeriodCloseApplicationSubtype =
  | 'InvalidCommand'
  | 'MissingPayload'
  | 'UserNotFound'
