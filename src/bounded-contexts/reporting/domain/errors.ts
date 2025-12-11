// Error subtypes specific to the Reporting bounded context

export type ReportingDomainSubtype =
  | 'NoDataForPeriod'
  | 'InvalidAccountType'
  | 'CalculationError'
  | 'AccountingEquationViolation'
  | 'InvalidDateRange'
  | 'MissingCapitalAccount'
  | 'MissingDrawingAccount'
  | 'CashAccountNotFound'

export type ReportingInfrastructureSubtype =
  | 'DataFetchFailed'
  | 'CacheMiss'

export type ReportingApplicationSubtype =
  | 'MissingDateParameter'
  | 'InvalidParameterFormat'