import { validateJournalEntry, JournalEntry, JournalLine } from '../domain/ledger'
import { createJournalEntry } from '../infrastructure/journalEntryRepo'
import { findAccountById } from '../infrastructure/accountRepo'
import { Failure, Result } from '@/common/types/result'
import { DomainFailure, AppError } from '@/common/types/errors'
import { LedgerDomainSubtype } from '../domain/errors'

/**
 * Workflow input: raw data from command (API request).
 */
export type PostJournalEntryCommand = {
  userId: string
  entryNumber?: string
  description: string
  date: string // ISO string
  lines: Array<{
    accountId: string
    amount: number
    side: 'Debit' | 'Credit'
  }>
}

type ValidateAccountsExistResult =
  | { success: true }
  | { success: false, error: AppError }

/**
 * Validate that all referenced accounts exist and belong to the user.
 */
const validateAccountsExist = async (userId: string, lines: JournalLine[]): Promise<ValidateAccountsExistResult> => {
  for (const line of lines) {
    const accountResult = await findAccountById(userId, line.accountId)
    if (!accountResult.isSuccess) {
      return {
        success: false,
        error: DomainFailure(
          'AccountNotFound' as LedgerDomainSubtype,
          `Account ${line.accountId} not found or access denied.`
        )
      }
    }
    if (accountResult.value === null) {
      return {
        success: false,
        error: DomainFailure(
          'AccountNotFound' as LedgerDomainSubtype,
          `Account ${line.accountId} does not exist.`
        )
      }
    }
  }
  return { success: true }
}

/**
 * Post Journal Entry Workflow - Application Layer
 * 
 * Steps:
 * 1. Validate command structure (pure validation)
 * 2. Validate that all referenced accounts exist (infrastructure)
 * 3. Persist journal entry (infrastructure)
 * 
 * Returns a Promise<Result<JournalEntry>>.
 */
export const postJournalEntryWorkflow = async (command: PostJournalEntryCommand): Promise<Result<JournalEntry>> => {
  // Step 1: Pure validation
  const entryToValidate: Omit<JournalEntry, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
    entryNumber: command.entryNumber,
    description: command.description,
    date: new Date(command.date),
    lines: command.lines.map(line => ({
      accountId: line.accountId,
      amount: line.amount,
      side: line.side
    }))
  }

  const validationResult = validateJournalEntry(entryToValidate)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Step 2: Validate accounts exist
  const accountsValidation = await validateAccountsExist(command.userId, entryToValidate.lines)
  if (!accountsValidation.success) {
    return Failure(accountsValidation.error)
  }

  // Step 3: Persist
  const entryToCreate: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    entryNumber: command.entryNumber,
    description: command.description,
    date: new Date(command.date),
    lines: command.lines.map(line => ({
      accountId: line.accountId,
      amount: line.amount,
      side: line.side
    }))
  }

  return createJournalEntry(entryToCreate)
}