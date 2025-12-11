import { Result, Failure } from '@/common/types/result'
import {
  findCashAccount,
  getCashJournalLines,
} from '../infrastructure/reportingRepo'
import {
  buildStatementOfCashFlows,
  StatementOfCashFlows,
} from '../domain/reporting'
import { DomainFailure } from '@/common/types/errors'
import { ReportingDomainSubtype } from '../domain/errors'

/**
 * Generate Statement of Cash Flows Workflow - Application Layer
 *
 * Orchestrates the process of generating a statement of cash flows for a user within a date range.
 * Steps:
 * 1. Fetch cash account (default code 101) for the user.
 * 2. Fetch cash journal lines for the period.
 * 3. Build the statement (pure domain).
 */
export const generateStatementOfCashFlowsWorkflow = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<StatementOfCashFlows>> => {
  // 1. Fetch cash account
  const cashAccountResult = await findCashAccount(userId)
  if (!cashAccountResult.isSuccess) return cashAccountResult
  const cashAccount = cashAccountResult.value
  if (!cashAccount) {
    return Failure(
      DomainFailure(
        'CashAccountNotFound' as ReportingDomainSubtype,
        `Cash account (code 101) not found for user ${userId}.`
      )
    )
  }

  // 2. Fetch cash journal lines for the period
  const cashLinesResult = await getCashJournalLines(
    userId,
    cashAccount.id,
    startDate,
    endDate
  )
  if (!cashLinesResult.isSuccess) return cashLinesResult

  // 3. Build the statement
  return buildStatementOfCashFlows(
    cashAccount,
    cashLinesResult.value,
    startDate,
    endDate
  )
}