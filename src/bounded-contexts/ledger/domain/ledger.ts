import * as R from 'ramda'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { LedgerDomainSubtype } from './errors'

// --- Value Objects ---

export type Money = number // positive, with up to 2 decimal places for cents

export type AccountCode = string // e.g., "101", "201.1"

// String unions matching Prisma enums
export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'
export type NormalBalance = 'Debit' | 'Credit'
export type JournalLineSide = 'Debit' | 'Credit'

// For convenience, we can also provide constants
export const AccountType = {
  Asset: 'Asset' as AccountType,
  Liability: 'Liability' as AccountType,
  Equity: 'Equity' as AccountType,
  Revenue: 'Revenue' as AccountType,
  Expense: 'Expense' as AccountType,
}

export const NormalBalance = {
  Debit: 'Debit' as NormalBalance,
  Credit: 'Credit' as NormalBalance,
}

export const JournalLineSide = {
  Debit: 'Debit' as JournalLineSide,
  Credit: 'Credit' as JournalLineSide,
}

// --- Entities ---

export type Account = {
  id?: string
  userId: string
  code: AccountCode
  name: string
  type: AccountType
  normalBalance: NormalBalance
  createdAt?: Date
  updatedAt?: Date
}

export type JournalLine = {
  id?: string
  accountId: string
  amount: Money
  side: JournalLineSide
}

export type JournalEntry = {
  id?: string
  userId: string
  entryNumber?: string
  description: string
  date: Date
  lines: JournalLine[]
  createdAt?: Date
  updatedAt?: Date
}

// --- Pure Validation Functions ---

const isAccountCodeValid = (code: string): boolean =>
  /^[0-9]+(\.[0-9]+)?$/.test(code) && code.length <= 20

const isAccountNameValid = (name: string): boolean =>
  name.trim().length >= 1 && name.length <= 100

const isAmountValid = (amount: Money): boolean =>
  amount > 0 && Number.isFinite(amount) && Math.round(amount * 100) === amount * 100

const isDescriptionValid = (description: string): boolean =>
  description.trim().length >= 1 && description.length <= 500

/**
 * Validate and normalize an account code.
 */
export const validateAccountCode = (code: string): Result<AccountCode> => {
  const trimmed = code.trim()
  if (!isAccountCodeValid(trimmed)) {
    return Failure(
      DomainFailure(
        'InvalidAccountCode' as LedgerDomainSubtype,
        'Account code must be numeric with optional dot, max 20 chars.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate account name.
 */
export const validateAccountName = (name: string): Result<string> => {
  const trimmed = name.trim()
  if (!isAccountNameValid(trimmed)) {
    return Failure(
      DomainFailure(
        'InvalidAccountName' as LedgerDomainSubtype,
        'Account name must be between 1 and 100 characters.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate amount (positive, up to two decimals).
 */
export const validateAmount = (amount: Money): Result<Money> => {
  if (!isAmountValid(amount)) {
    return Failure(
      DomainFailure(
        'InvalidAmount' as LedgerDomainSubtype,
        'Amount must be positive and have at most two decimal places.'
      )
    )
  }
  return Success(amount)
}

/**
 * Validate that the journal entry is balanced (total debits = total credits).
 */
export const validateJournalEntryBalanced = (lines: JournalLine[]): Result<JournalLine[]> => {
  const totalDebits = R.pipe(
    R.filter((line: JournalLine) => line.side === 'Debit'),
    R.map((line: JournalLine) => line.amount),
    R.sum
  )(lines)

  const totalCredits = R.pipe(
    R.filter((line: JournalLine) => line.side === 'Credit'),
    R.map((line: JournalLine) => line.amount),
    R.sum
  )(lines)

  if (Math.abs(totalDebits - totalCredits) > 0.001) {
    return Failure(
      DomainFailure(
        'JournalEntryNotBalanced' as LedgerDomainSubtype,
        `Debits (${totalDebits}) do not equal credits (${totalCredits}).`
      )
    )
  }
  return Success(lines)
}

/**
 * Validate that the journal entry has at least two lines.
 */
export const validateJournalEntryHasLines = (lines: JournalLine[]): Result<JournalLine[]> => {
  if (lines.length < 2) {
    return Failure(
      DomainFailure(
        'InsufficientLines' as LedgerDomainSubtype,
        'Journal entry must have at least two lines.'
      )
    )
  }
  return Success(lines)
}

/**
 * Validate the entire journal entry (composition of validations).
 */
export const validateJournalEntry = (entry: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Result<JournalEntry> => {
  // Validate description
  if (!isDescriptionValid(entry.description)) {
    return Failure(
      DomainFailure(
        'InvalidJournalEntryDescription' as LedgerDomainSubtype,
        'Description must be between 1 and 500 characters.'
      )
    )
  }

  // Validate date (must be a valid Date, not in the future? we'll leave that for business rules)
  if (!(entry.date instanceof Date) || isNaN(entry.date.getTime())) {
    return Failure(
      DomainFailure(
        'InvalidJournalEntryDate' as LedgerDomainSubtype,
        'Date must be a valid date.'
      )
    )
  }

  // Validate lines using railway composition
  const linesResult = validateJournalEntryHasLines(entry.lines)
  const balancedResult = andThen(validateJournalEntryBalanced)(linesResult)

  if (balancedResult.isSuccess) {
    return Success({
      ...entry,
      id: undefined,
      userId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    // balancedResult is a Failure, but its error type is AppError, which matches Result<JournalEntry>
    // However, TypeScript doesn't know that balancedResult.error is the same as the error we need.
    // We can return Failure(balancedResult.error) to satisfy the type.
    return Failure(balancedResult.error)
  }
}