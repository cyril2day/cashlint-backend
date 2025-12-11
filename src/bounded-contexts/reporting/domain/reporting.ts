import * as R from 'ramda'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { ReportingDomainSubtype } from './errors'
import {
  AccountType,
  NormalBalance,
  JournalLineSide,
  type JournalLine,
  type Money,
} from '@/bounded-contexts/ledger/domain/ledger'

// --- Value Objects ---

// Account with its current balance (as of a given date or period)
export type AccountWithBalance = {
  readonly id: string
  readonly userId: string
  readonly code: string
  readonly name: string
  readonly type: AccountType  // Asset | Liability | Equity | Revenue | Expense
  readonly normalBalance: NormalBalance  // Debit | Credit
  readonly balance: Money    // signed according to normal balance
}

// Financial statement line item
export type StatementLine = {
  readonly accountCode: string
  readonly accountName: string
  readonly amount: Money
}

// Income Statement
export type IncomeStatement = {
  readonly period: { startDate: Date; endDate: Date }
  readonly revenues: readonly StatementLine[]
  readonly revenueTotal: Money
  readonly expenses: readonly StatementLine[]
  readonly expenseTotal: Money
  readonly netIncome: Money   // revenueTotal - expenseTotal
}

// Balance Sheet
export type BalanceSheet = {
  readonly asOfDate: Date
  readonly assets: readonly StatementLine[]
  readonly assetTotal: Money
  readonly liabilities: readonly StatementLine[]
  readonly liabilityTotal: Money
  readonly equity: readonly StatementLine[]
  readonly equityTotal: Money
  // Verification: assetTotal === liabilityTotal + equityTotal (within tolerance)
}

// Statement of Owner’s Equity
export type StatementOfOwnersEquity = {
  readonly period: { startDate: Date; endDate: Date }
  readonly beginningCapital: Money
  readonly additionalContributions: Money
  readonly netIncome: Money
  readonly drawings: Money
  readonly endingCapital: Money
}

// Statement of Cash Flows
export type CashFlowActivity = 'Operating' | 'Investing' | 'Financing'
export type CashFlowLine = {
  readonly description: string
  readonly amount: Money
  readonly activity: CashFlowActivity
}
export type StatementOfCashFlows = {
  readonly period: { startDate: Date; endDate: Date }
  readonly operatingActivities: readonly CashFlowLine[]
  readonly investingActivities: readonly CashFlowLine[]
  readonly financingActivities: readonly CashFlowLine[]
  readonly netCashChange: Money  // sum of all activities
  readonly beginningCash: Money
  readonly endingCash: Money
}

// Re‑export ledger types for convenience
export { AccountType, NormalBalance, JournalLineSide }
export const AccountTypeEnum = AccountType
export const NormalBalanceEnum = NormalBalance
export const JournalLineSideEnum = JournalLineSide

// --- Pure Functions ---

/**
 * Classify an account by its type (just a pass‑through).
 */
export const classifyAccountByType = (account: AccountWithBalance): AccountType =>
  account.type

/**
 * Determine if an account is a contra‑account (e.g., Accumulated Depreciation).
 * Heuristic: name contains "Accumulated" or "Depreciation" (case‑insensitive).
 */
export const isContraAccount = (account: AccountWithBalance): boolean => {
  const lowerName = account.name.toLowerCase()
  return lowerName.includes('accumulated') || lowerName.includes('depreciation')
}

/**
 * Calculate the balance of an account given its journal lines.
 * The balance is signed according to the account's normal balance:
 * - If normalBalance is 'Debit': debits increase, credits decrease.
 * - If normalBalance is 'Credit': credits increase, debits decrease.
 */
export const calculateAccountBalance = (
  account: AccountWithBalance,
  lines: JournalLine[]
): Money => {
  const { normalBalance } = account
  let balance = 0
  for (const line of lines) {
    if (line.accountId !== account.id) continue
    if (line.side === 'Debit') {
      balance += normalBalance === 'Debit' ? line.amount : -line.amount
    } else {
      balance += normalBalance === 'Credit' ? line.amount : -line.amount
    }
  }
  return balance
}

/**
 * Calculate net income as total revenue balances minus total expense balances.
 * Assumes revenue accounts have credit normal balance, expense accounts have debit normal balance.
 */
export const calculateNetIncome = (
  revenueAccounts: AccountWithBalance[],
  expenseAccounts: AccountWithBalance[]
): Money => {
  const totalRevenue = R.sum(R.map((acc) => acc.balance, revenueAccounts))
  const totalExpense = R.sum(R.map((acc) => acc.balance, expenseAccounts))
  return totalRevenue - totalExpense
}

/**
 * Validate a date range (start <= end).
 */
export const validateDateRange = (
  startDate: Date,
  endDate: Date
): Result<{ startDate: Date; endDate: Date }> => {
  if (startDate > endDate) {
    return Failure(
      DomainFailure(
        'InvalidDateRange' as ReportingDomainSubtype,
        `Start date (${startDate.toISOString()}) must be on or before end date (${endDate.toISOString()}).`
      )
    )
  }
  return Success({ startDate, endDate })
}

/**
 * Build an income statement from accounts with balances for a given period.
 */
export const buildIncomeStatement = (
  accounts: AccountWithBalance[],
  startDate: Date,
  endDate: Date
): Result<IncomeStatement> => {
  const dateRangeResult = validateDateRange(startDate, endDate)
  if (!dateRangeResult.isSuccess) return dateRangeResult

  const revenues = accounts.filter((acc) => acc.type === 'Revenue')
  const expenses = accounts.filter((acc) => acc.type === 'Expense')

  const revenueLines: StatementLine[] = revenues
    .map((acc) => ({
      accountCode: acc.code,
      accountName: acc.name,
      amount: acc.balance,
    }))
    .filter((line) => line.amount !== 0)
  const expenseLines: StatementLine[] = expenses
    .map((acc) => ({
      accountCode: acc.code,
      accountName: acc.name,
      amount: acc.balance,
    }))
    .filter((line) => line.amount !== 0)

  const revenueTotal = R.sum(R.map((line) => line.amount, revenueLines))
  const expenseTotal = R.sum(R.map((line) => line.amount, expenseLines))
  const netIncome = revenueTotal - expenseTotal

  return Success({
    period: { startDate, endDate },
    revenues: revenueLines,
    revenueTotal,
    expenses: expenseLines,
    expenseTotal,
    netIncome,
  })
}

/**
 * Build a balance sheet from accounts with balances as of a specific date.
 * Verifies the accounting equation (assets = liabilities + equity) within a tolerance.
 *
 * Equity includes:
 * - Equity accounts (Owner Capital, Owner Drawing) with amounts adjusted for contra-equity (drawing is negative).
 * - Retained Earnings, computed as net income (total revenue - total expense).
 */
export const buildBalanceSheet = (
  accounts: AccountWithBalance[],
  asOfDate: Date
): Result<BalanceSheet> => {
  const assets = accounts.filter((acc) => acc.type === 'Asset')
  const liabilities = accounts.filter((acc) => acc.type === 'Liability')
  const equityAccounts = accounts.filter((acc) => acc.type === 'Equity')
  const revenueAccounts = accounts.filter((acc) => acc.type === 'Revenue')
  const expenseAccounts = accounts.filter((acc) => acc.type === 'Expense')

  // Asset lines with contra‑asset adjustment
  const assetLines: StatementLine[] = assets.map((acc) => ({
    accountCode: acc.code,
    accountName: acc.name,
    amount: isContraAccount(acc) ? -acc.balance : acc.balance,
  }))
  // Liability lines (no contra‑liability in v1)
  const liabilityLines: StatementLine[] = liabilities.map((acc) => ({
    accountCode: acc.code,
    accountName: acc.name,
    amount: acc.balance,
  }))
  // Equity lines: adjust for contra‑equity (debit normal balance → negative)
  const equityAccountLines: StatementLine[] = equityAccounts.map((acc) => ({
    accountCode: acc.code,
    accountName: acc.name,
    amount: acc.normalBalance === 'Debit' ? -acc.balance : acc.balance,
  }))
  // Retained earnings line (net income)
  const netIncome = calculateNetIncome(revenueAccounts, expenseAccounts)
  const retainedEarningsLine: StatementLine = {
    accountCode: '399', // virtual code for retained earnings
    accountName: 'Retained Earnings',
    amount: netIncome,
  }
  const equityLines = [...equityAccountLines, retainedEarningsLine]

  const assetTotal = R.sum(R.map((line) => line.amount, assetLines))
  const liabilityTotal = R.sum(R.map((line) => line.amount, liabilityLines))
  const equityTotal = R.sum(R.map((line) => line.amount, equityLines))

  // Accounting equation must hold (within 0.01 due to rounding)
  const diff = Math.abs(assetTotal - (liabilityTotal + equityTotal))
  if (diff > 0.01) {
    return Failure(
      DomainFailure(
        'AccountingEquationViolation' as ReportingDomainSubtype,
        `Balance sheet equation violated: assets (${assetTotal}) != liabilities (${liabilityTotal}) + equity (${equityTotal}) (difference: ${diff}).`
      )
    )
  }

  return Success({
    asOfDate,
    assets: assetLines,
    assetTotal,
    liabilities: liabilityLines,
    liabilityTotal,
    equity: equityLines,
    equityTotal,
  })
}

/**
 * Build a statement of owner’s equity.
 * Requires beginning capital, contributions during the period, drawings during the period, and net income.
 */
export const buildStatementOfOwnersEquity = (
  beginningCapital: Money,
  contributionsDuringPeriod: Money,
  drawingsDuringPeriod: Money,
  netIncome: Money,
  period: { startDate: Date; endDate: Date }
): Result<StatementOfOwnersEquity> => {
  const endingCapital = beginningCapital + contributionsDuringPeriod + netIncome - drawingsDuringPeriod

  return Success({
    period,
    beginningCapital,
    additionalContributions: contributionsDuringPeriod,
    netIncome,
    drawings: drawingsDuringPeriod,
    endingCapital,
  })
}

/**
 * Build a statement of cash flows by classifying cash transactions.
 * Heuristic classification:
 * - Operating: transactions involving revenue or expense accounts.
 * - Investing: transactions involving asset accounts (except cash).
 * - Financing: transactions involving liability or equity accounts.
 * This is a simplified version; in a real system you would have more rules.
 */
export const buildStatementOfCashFlows = (
  cashAccount: AccountWithBalance,
  cashLines: JournalLine[],
  startDate: Date,
  endDate: Date
): Result<StatementOfCashFlows> => {
  const dateRangeResult = validateDateRange(startDate, endDate)
  if (!dateRangeResult.isSuccess) return dateRangeResult

  // We need to classify each line. For now, we'll assume we have additional context (counterpart accounts).
  // However, the function signature only provides cash lines; we cannot classify without knowing the other side.
  // This is a placeholder implementation that returns empty activities.
  // In a real implementation, we would need the full journal entry for each cash line.

  const operatingActivities: CashFlowLine[] = []
  const investingActivities: CashFlowLine[] = []
  const financingActivities: CashFlowLine[] = []

  // For the sake of the example, we'll just sum the net cash change from the cash account balance.
  const netCashChange = cashAccount.balance // This is the change over the period? Actually, balance is as of endDate.
  // We need beginning and ending cash balances. We'll assume we have them as parameters.
  // For now, we'll set beginningCash = endingCash - netCashChange, but that's circular.
  // This function is incomplete and will be refined later.

  const beginningCash = 0 // placeholder
  const endingCash = beginningCash + netCashChange

  return Success({
    period: { startDate, endDate },
    operatingActivities,
    investingActivities,
    financingActivities,
    netCashChange,
    beginningCash,
    endingCash,
  })
}