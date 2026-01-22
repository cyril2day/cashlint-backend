import { equals, gt, ifElse, when, unless, dispatch } from 'pristine-fp'
import { map, filter, sum, pipe, allOf, anyOf } from '@/shared/fp-utils'
import { AccountType, NormalBalance, JournalLineSide, type JournalLine, type Money } from '@/bounded-contexts/ledger/domain/ledger'
import type { AccountWithBalance, StatementLine } from './reporting'
import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { ReportingDomainSubtype } from './errors'

// --- Equality and Comparison Helpers ---

/**
 * Curried equality check for AccountType.
 * @example isAsset = isAccountType('Asset')
 */
export const isAccountType = (type: AccountType) => (account: AccountWithBalance): boolean =>
  equals(type)(account.type)

/**
 * Curried equality check for JournalLineSide.
 */
export const isSide = (side: JournalLineSide) => (line: JournalLine): boolean =>
  equals(side)(line.side)

/**
 * Curried equality check for NormalBalance.
 */
export const isNormalBalance = (balance: NormalBalance) => (account: AccountWithBalance): boolean =>
  equals(balance)(account.normalBalance)

// --- Account Classification ---

/**
 * Determines whether an account is a contra‑account (e.g., Accumulated Depreciation).
 * Uses case‑insensitive substring matching.
 */
export const isContraAccount = (account: AccountWithBalance): boolean => {
  const lowerName = account.name.toLowerCase()
  return anyOf(
    (name: string) => name.includes('accumulated'),
    (name: string) => name.includes('depreciation')
  )(lowerName)
}

// --- Balance Adjustments (Contra‑Accounts) ---

/**
 * If the account is a contra‑asset, returns its negated balance; otherwise undefined.
 */
const contraAssetAdjustment = (acc: AccountWithBalance): Money | undefined =>
  when(isContraAccount(acc), () => -acc.balance)

/**
 * If the account is equity with debit normal balance, returns its negated balance; otherwise undefined.
 */
const contraEquityAdjustment = (acc: AccountWithBalance): Money | undefined =>
  when(
    allOf(isAccountType('Equity'), isNormalBalance('Debit'))(acc),
    () => -acc.balance
  )

/**
 * The default adjustment: returns the account’s balance unchanged.
 */
const regularBalance = (acc: AccountWithBalance): Money => acc.balance

// Type‑safe cast for dispatch (dispatch expects functions that accept unknown arguments)
type Dispatcher = (...args: unknown[]) => unknown
/**
 * Computes the adjusted balance for a balance‑sheet line, applying contra‑account rules.
 */
export const adjustedBalance = (acc: AccountWithBalance): Money => {
  const result = dispatch(
    contraAssetAdjustment as Dispatcher,
    contraEquityAdjustment as Dispatcher,
    regularBalance as Dispatcher
  )(acc)
  // The dispatch chain guarantees a Money result because regularBalance always returns Money
  return result as Money
}

// --- Signing Logic ---

/**
 * Returns the signed amount for a journal line according to the account’s normal balance.
 * Increase (positive) when side equals normalBalance; decrease (negative) otherwise.
 *
 * @param side The side of the journal line (Debit/Credit)
 * @param normalBalance The account’s normal balance (Debit/Credit)
 * @param amount The absolute amount
 * @returns The signed amount
 */
export const signedAmount = (
  side: JournalLineSide,
  normalBalance: NormalBalance,
  amount: Money
): Money =>
  ifElse(
    () => equals(side)(normalBalance),
    () => amount,
    () => -amount
  )

// --- Pipeline Helpers ---

/**
 * Filters accounts by a specific AccountType.
 */
export const filterByAccountType = (type: AccountType) =>
  filter(isAccountType(type))

/**
 * Transforms an AccountWithBalance into a StatementLine.
 */
export const toStatementLine = (account: AccountWithBalance): StatementLine => ({
  accountCode: account.code,
  accountName: account.name,
  amount: account.balance,
})

/**
 * Predicate that checks whether a statement line has a non‑zero amount.
 */
export const isNonZeroLine = (line: StatementLine): boolean => line.amount !== 0

/**
 * Sums the amounts of an array of StatementLines.
 */
export const sumLines = pipe(map((line: StatementLine) => line.amount), sum)

// --- Date Validation (functional version) ---

/**
 * Validates that startDate is on or before endDate.
 * Returns a Result containing the date range on success.
 */
export const validateDateRange = (
  startDate: Date,
  endDate: Date
): Result<{ startDate: Date; endDate: Date }> => {
  // Use timestamp for numeric comparison
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()
  return ifElse(
    () => gt(endMs)(startMs),   // condition: endDate > startDate  (i.e., startDate <= endDate)
    () => Failure(
      DomainFailure(
        'InvalidDateRange' as ReportingDomainSubtype,
        `Start date (${startDate.toISOString()}) must be on or before end date (${endDate.toISOString()}).`
      )
    ),
    () => Success({ startDate, endDate })
  )
}