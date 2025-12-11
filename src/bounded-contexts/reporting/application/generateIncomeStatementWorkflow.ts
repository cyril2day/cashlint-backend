import { Result } from '@/common/types/result'
import { getAccountsWithPeriodBalances } from '../infrastructure/reportingRepo'
import { buildIncomeStatement, IncomeStatement } from '../domain/reporting'

/**
 * Generate Income Statement Workflow - Application Layer
 *
 * Orchestrates the process of generating an income statement for a user within a date range.
 * Steps:
 * 1. Validate date range (done in domain)
 * 2. Fetch accounts with period‑specific balances (infrastructure)
 * 3. Build income statement (pure domain)
 */
export const generateIncomeStatementWorkflow = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<IncomeStatement>> => {
  // 1. Fetch accounts with balances for the period
  const accountsResult = await getAccountsWithPeriodBalances(userId, startDate, endDate)
  if (!accountsResult.isSuccess) {
    // Map infrastructure errors, preserving them
    return accountsResult
  }

  // 2. Build the income statement (domain pure function)
  const statementResult = buildIncomeStatement(accountsResult.value, startDate, endDate)
  if (!statementResult.isSuccess) {
    // Domain validation failure (e.g., invalid date range)
    return statementResult
  }

  // 3. Success
  return statementResult
}