import { validateCashExpense, CashExpense, Money } from '../domain/purchasing'
import { createCashExpense } from '../infrastructure/cashExpenseRepo'
import { findVendorById } from '../infrastructure/vendorRepo'
import { createJournalEntry } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'
import { findAccountByCode } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PurchasingDomainSubtype } from '../domain/errors'
import { JournalLineSide, Account } from '@/bounded-contexts/ledger/domain/ledger'
import { DEFAULT_ACCOUNT_CODES } from '@/bounded-contexts/ledger/domain/defaultAccounts'
import { fromNullable as optionFromNullable, getOrElse as optionGetOrElse } from '@/common/types/option'

/**
 * Workflow input: raw data from command (API request).
 */
export type RecordCashExpenseCommand = {
  userId: string
  vendorId: string
  amount: Money
  date: string // ISO string
  expenseCategory: string
  description?: string
}

/**
 * Record Cash Expense Workflow - Application Layer
 *
 * Steps:
 * 1. Validate command structure (pure validation)
 * 2. Validate that the vendor exists and belongs to the user (optional but recommended)
 * 3. Find the required accounts (Cash and Expense) by code for the user
 *    - Cash: default 101
 *    - Expense: based on expenseCategory; for v1 we use a default expense account (501 Salaries Expense)
 * 4. Create a journal entry for the expense (debit Expense, credit Cash)
 * 5. Create the cash expense record with the journal entry reference
 *
 * Returns a Promise<Result<CashExpense>>.
 */
export const recordCashExpenseWorkflow = async (command: RecordCashExpenseCommand): Promise<Result<CashExpense>> => {
  // Step 1: Pure validation
  const expenseToValidate: Omit<CashExpense, 'id' | 'journalEntryId' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    vendorId: command.vendorId,
    amount: command.amount,
    date: new Date(command.date),
    expenseCategory: command.expenseCategory,
    description: command.description,
  }

  const validationResult = validateCashExpense(expenseToValidate)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Step 2: Validate vendor exists (optional but we'll enforce for consistency)
  const vendorResult = await findVendorById(command.userId, command.vendorId)
  if (!vendorResult.isSuccess) {
    return vendorResult
  }
  if (vendorResult.value === null) {
    return Failure(
      DomainFailure(
        'VendorNotFound' as PurchasingDomainSubtype,
        `Vendor ${command.vendorId} not found or access denied.`
      )
    )
  }

  // Step 3: Find required accounts
  // Cash account (101)
  const cashAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.CASH)
  if (!cashAccountResult.isSuccess) {
    return cashAccountResult
  }
  if (cashAccountResult.value === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as PurchasingDomainSubtype,
        `Default Cash account (code ${DEFAULT_ACCOUNT_CODES.CASH}) not found. Please set up chart of accounts.`
      )
    )
  }
  const cashAccountValue = cashAccountResult.value

  // Expense account: for v1 we use a default expense account (501 Salaries Expense)
  // In the future, we could map expenseCategory to different account codes.
  const expenseAccountCode = DEFAULT_ACCOUNT_CODES.SALARIES_EXPENSE
  const expenseAccountResult = await findAccountByCode(command.userId, expenseAccountCode)
  if (!expenseAccountResult.isSuccess) {
    return expenseAccountResult
  }
  if (expenseAccountResult.value === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as PurchasingDomainSubtype,
        `Default Expense account (code ${expenseAccountCode}) not found. Please set up chart of accounts.`
      )
    )
  }
  const expenseAccountValue = expenseAccountResult.value

  // Step 4: Create journal entry
  const description = optionGetOrElse(`Cash expense ${command.expenseCategory}`)(optionFromNullable(command.description))
  const journalEntryResult = await createJournalEntry({
    userId: command.userId,
    entryNumber: `CASH-EXP-${Date.now()}`,
    description,
    date: new Date(command.date),
    lines: [
      {
        accountId: expenseAccountValue.id!,
        amount: command.amount,
        side: 'Debit' as JournalLineSide, // Expense increases with debit
      },
      {
        accountId: cashAccountValue.id!,
        amount: command.amount,
        side: 'Credit' as JournalLineSide, // Cash decreases with credit
      },
    ],
  })

  if (!journalEntryResult.isSuccess) {
    return journalEntryResult
  }

  const journalEntry = journalEntryResult.value

  // Step 5: Create cash expense record
  const expenseToCreate: Omit<CashExpense, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    vendorId: command.vendorId,
    amount: command.amount,
    date: new Date(command.date),
    expenseCategory: command.expenseCategory,
    description: command.description,
    journalEntryId: journalEntry.id!,
  }

  const expenseResult = await createCashExpense(expenseToCreate)
  if (!expenseResult.isSuccess) {
    // TODO: Rollback journal entry? For now, leave orphaned.
    return expenseResult
  }

  return expenseResult
}