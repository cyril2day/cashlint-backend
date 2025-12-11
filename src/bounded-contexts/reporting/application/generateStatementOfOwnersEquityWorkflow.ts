import { Result, Failure } from '@/common/types/result'
import {
  findAccountByCode,
  getAccountsWithPeriodBalances,
} from '../infrastructure/reportingRepo'
import {
  buildStatementOfOwnersEquity,
  StatementOfOwnersEquity,
  calculateNetIncome,
} from '../domain/reporting'
import { DomainFailure } from '@/common/types/errors'
import { ReportingDomainSubtype } from '../domain/errors'

/**
 * Generate Statement of Owner’s Equity Workflow - Application Layer
 *
 * Orchestrates the process of generating a statement of owner’s equity for a user within a date range.
 * Steps:
 * 1. Fetch capital account (code 301) and drawing account (code 302) with cumulative balances up to the start of the period (beginning capital and drawings).
 * 2. Compute net income for the period (using revenue and expense accounts).
 * 3. Compute contributions during the period (change in capital account) and drawings during the period (change in drawing account).
 * 4. Build the statement (pure domain).
 */
export const generateStatementOfOwnersEquityWorkflow = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<StatementOfOwnersEquity>> => {
  // 1. Fetch capital and drawing accounts as of the start of the period (beginning balances)
  const capitalAccountResult = await findAccountByCode(userId, '301', startDate)
  if (!capitalAccountResult.isSuccess) return capitalAccountResult
  const capitalAccount = capitalAccountResult.value
  if (!capitalAccount) {
    return Failure(
      DomainFailure(
        'MissingCapitalAccount' as ReportingDomainSubtype,
        `Capital account (code 301) not found for user ${userId}.`
      )
    )
  }

  const drawingAccountResult = await findAccountByCode(userId, '302', startDate)
  if (!drawingAccountResult.isSuccess) return drawingAccountResult
  const drawingAccount = drawingAccountResult.value
  if (!drawingAccount) {
    return Failure(
      DomainFailure(
        'MissingDrawingAccount' as ReportingDomainSubtype,
        `Drawing account (code 302) not found for user ${userId}.`
      )
    )
  }

  // 2. Compute net income for the period
  const periodAccountsResult = await getAccountsWithPeriodBalances(
    userId,
    startDate,
    endDate
  )
  if (!periodAccountsResult.isSuccess) return periodAccountsResult

  const revenueAccounts = periodAccountsResult.value.filter(
    (acc) => acc.type === 'Revenue'
  )
  const expenseAccounts = periodAccountsResult.value.filter(
    (acc) => acc.type === 'Expense'
  )
  const netIncome = calculateNetIncome(revenueAccounts, expenseAccounts)

  // 3. Compute contributions and drawings during the period
  // Find capital and drawing accounts in period balances
  const capitalPeriod = periodAccountsResult.value.find((acc) => acc.code === '301')
  const drawingPeriod = periodAccountsResult.value.find((acc) => acc.code === '302')
  const contributionsDuringPeriod = capitalPeriod ? capitalPeriod.balance : 0
  const drawingsDuringPeriod = drawingPeriod ? drawingPeriod.balance : 0

  // 4. Build the statement
  return buildStatementOfOwnersEquity(
    capitalAccount.balance,          // beginningCapital
    contributionsDuringPeriod,       // additionalContributions
    drawingsDuringPeriod,            // drawings
    netIncome,
    { startDate, endDate }
  )
}