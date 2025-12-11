import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PeriodCloseDomainSubtype } from './errors'
import { validateStringLength, validateDateValid, pipeValidators } from '@/shared/validation'

// Value Objects
export type PeriodStatus = 'Open' | 'Closed'

// Entity
export type Period = {
  id?: string
  userId: string
  name: string
  startDate: Date
  endDate: Date
  status: PeriodStatus
  closedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export type ManualJournalEntryInput = {
  description: string
  date: Date
  lines: Array<{
    accountId: string
    amount: number
    side: 'Debit' | 'Credit'
  }>
}

// Validate period name (1-100 characters)
export const validatePeriodName = validateStringLength(1, 100, 'InvalidPeriodName' as PeriodCloseDomainSubtype)

// Validate date range (startDate < endDate)
export const validatePeriodDateRange = (startDate: Date, endDate: Date): Result<{ startDate: Date; endDate: Date }> => {
  if (startDate >= endDate) {
    return Failure(
      DomainFailure(
        'InvalidPeriodDateRange' as PeriodCloseDomainSubtype,
        'Start date must be before end date'
      )
    )
  }
  return Success({ startDate, endDate })
}

// Validate period is open
export const validatePeriodIsOpen = (period: Period): Result<Period> => {
  if (period.status === 'Closed') {
    return Failure(
      DomainFailure(
        'PeriodAlreadyClosed' as PeriodCloseDomainSubtype,
        `Period ${period.name} is already closed`
      )
    )
  }
  return Success(period)
}

// Validate period can be closed (no future entries, etc.)
export const validatePeriodCanBeClosed = (period: Period): Result<Period> => {
  // In v1: only check if period is already closed
  const openCheck = validatePeriodIsOpen(period)
  if (!openCheck.isSuccess) return openCheck
  
  // Additional business rules could be added here
  // e.g., check that there are no journal entries after the period end date
  return Success(period)
}

// Validate manual journal entry (reuses ledger validation)
export const validateManualJournalEntry = (entry: ManualJournalEntryInput): Result<ManualJournalEntryInput> => {
  // Reuse ledger validation for balanced entries, etc.
  // This will be implemented by calling ledger domain functions
  // For now, return success
  return Success(entry)
}