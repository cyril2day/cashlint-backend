import { Result } from '@/common/types/result'
import { getAccountsWithCumulativeBalances } from '../infrastructure/reportingRepo'
import { buildBalanceSheet, BalanceSheet } from '../domain/reporting'

/**
 * Generate Balance Sheet Workflow - Application Layer
 *
 * Orchestrates the process of generating a balance sheet for a user as of a specific date.
 * Steps:
 * 1. Fetch accounts with cumulative balances up to asOfDate (infrastructure)
 * 2. Build balance sheet (pure domain)
 */
export const generateBalanceSheetWorkflow = async (
  userId: string,
  asOfDate: Date
): Promise<Result<BalanceSheet>> => {
  // 1. Fetch accounts with cumulative balances
  const accountsResult = await getAccountsWithCumulativeBalances(userId, asOfDate)
  if (!accountsResult.isSuccess) {
    return accountsResult
  }

  // 2. Build the balance sheet (domain pure function)
  const sheetResult = buildBalanceSheet(accountsResult.value, asOfDate)
  if (!sheetResult.isSuccess) {
    return sheetResult
  }

  return sheetResult
}