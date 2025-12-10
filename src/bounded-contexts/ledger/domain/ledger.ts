import * as R from 'ramda'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { LedgerDomainSubtype } from './errors'
import {
  validateStringLength,
  validatePositiveMoneyWith,
  validateDateValid,
  validateDateNotFuture as validateDateNotFutureShared,
  validatePattern,
  pipeValidators
} from '@/shared/validation'

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

// --- Shared Predicates (reused) ---

/**
 * Validate account code pattern (numeric with optional dot) and length.
 */
export const validateAccountCode = (code: string): Result<string> => {
  const trimmed = code.trim()
  const patternResult = validatePattern(
    /^[0-9]+(\.[0-9]+)?$/,
    'InvalidAccountCode' as LedgerDomainSubtype,
    'Account code must be numeric with optional dot, max 20 chars.'
  )(trimmed)
  if (!patternResult.isSuccess) return patternResult

  if (trimmed.length > 20) {
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
 * Validate account name length.
 */
export const validateAccountName = validateStringLength(1, 100, 'InvalidAccountName' as LedgerDomainSubtype)

/**
 * Validate amount (positive, up to two decimals).
 */
export const validateAmount = validatePositiveMoneyWith('InvalidAmount' as LedgerDomainSubtype)

/**
 * Validate description length.
 */
export const validateDescription = validateStringLength(1, 500, 'InvalidJournalEntryDescription' as LedgerDomainSubtype)

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
 * Validate each line's amount is valid money.
 */
export const validateLinesAmount = (lines: JournalLine[]): Result<JournalLine[]> => {
  for (const line of lines) {
    const amountResult = validateAmount(line.amount)
    if (!amountResult.isSuccess) {
      return Failure(amountResult.error)
    }
  }
  return Success(lines)
}

/**
 * Validate date is valid and not in the future.
 */
export const validateJournalEntryDate = (date: Date): Result<Date> => {
  const validResult = validateDateNotFutureShared(date)
  if (!validResult.isSuccess) {
    // Map generic error to ledger-specific error
    return Failure(DomainFailure('InvalidJournalEntryDate' as LedgerDomainSubtype, validResult.error.message))
  }
  return Success(date)
}

/**
 * Validate the entire journal entry (composition of validations).
 */
export const validateJournalEntry = (entry: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'>): Result<JournalEntry> => {
  // Validate description
  const descriptionResult = validateDescription(entry.description)
  if (!descriptionResult.isSuccess) return descriptionResult as Result<JournalEntry>

  // Validate date
  const dateResult = validateJournalEntryDate(entry.date)
  if (!dateResult.isSuccess) return dateResult as Result<JournalEntry>

  // Validate lines using railway composition
  const linesResult = validateJournalEntryHasLines(entry.lines)
  const amountResult = andThen(validateLinesAmount)(linesResult)
  const balancedResult = andThen(validateJournalEntryBalanced)(amountResult)

  if (balancedResult.isSuccess) {
    return Success({
      ...entry,
      id: undefined,
      userId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(balancedResult.error)
  }
}