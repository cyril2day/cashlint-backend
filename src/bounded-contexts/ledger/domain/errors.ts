// Ledger-specific error subtypes
export type LedgerDomainSubtype =
  | 'InvalidAccountCode'
  | 'InvalidAccountName'
  | 'InvalidAccountType'
  | 'InvalidNormalBalance'
  | 'InvalidJournalEntryDescription'
  | 'InvalidJournalEntryDate'
  | 'JournalEntryNotBalanced'
  | 'JournalEntryEmpty'
  | 'AccountNotFound'
  | 'DuplicateAccountCode'
  | 'InsufficientLines'
  | 'InvalidAmount'
  | 'InvalidSide'
  | 'PeriodClosed'
  | 'ImmutableAccountCode'

export type LedgerInfrastructureSubtype =
  | 'AccountRepositoryError'
  | 'JournalEntryRepositoryError'
  | 'DatabaseConnectionError'
  | 'DuplicateKey'

export type LedgerApplicationSubtype =
  | 'InvalidCommand'
  | 'MissingPayload'
  | 'UserNotFound'