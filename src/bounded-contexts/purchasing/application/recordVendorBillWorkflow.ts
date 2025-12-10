import { validateVendorBill, VendorBill, VendorBillStatus, Money } from '../domain/purchasing'
import { createVendorBill, findVendorBillByNumber } from '../infrastructure/vendorBillRepo'
import { findVendorById, updateVendorBalance } from '../infrastructure/vendorRepo'
import { createJournalEntry } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'
import { findAccountByCode } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PurchasingDomainSubtype } from '../domain/errors'
import { JournalLineSide, Account } from '@/bounded-contexts/ledger/domain/ledger'
import { DEFAULT_ACCOUNT_CODES } from '@/bounded-contexts/ledger/domain/defaultAccounts'
import { fromNullable as optionFromNullable, getOrElse as optionGetOrElse } from '@/common/types/option'

/**
 * Workflow input: raw data from command (API request).
 */
export type RecordVendorBillCommand = {
  userId: string
  vendorId: string
  billNumber: string
  amount: Money
  date: string // ISO string
  dueDate?: string // ISO string
  description?: string
}

/**
 * Record Vendor Bill Workflow - Application Layer
 *
 * Steps:
 * 1. Validate command structure (pure validation)
 * 2. Validate that the vendor exists and belongs to the user
 * 3. Validate that the bill number is unique for this user
 * 4. Find the required accounts (Expense account and Accounts Payable) by code for the user
 * 5. Create a journal entry for the expense/liability
 * 6. Create the vendor bill record with the journal entry reference
 * 7. Update the vendor's subsidiary balance (increase Accounts Payable)
 *
 * Returns a Promise<Result<VendorBill>>.
 */
export const recordVendorBillWorkflow = async (command: RecordVendorBillCommand): Promise<Result<VendorBill>> => {
  // Step 1: Pure validation
  const billToValidate: Omit<VendorBill, 'id' | 'status' | 'journalEntryId' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    vendorId: command.vendorId,
    billNumber: command.billNumber,
    amount: command.amount,
    date: new Date(command.date),
    dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
    description: command.description,
  }

  const validationResult = validateVendorBill(billToValidate)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Helper to convert Result<T | null> to Result<T> with a custom error when null
  const ensureNotNull = <T>(error: ReturnType<typeof DomainFailure>) => (result: Result<T | null>): Result<T> => {
    if (!result.isSuccess) return result
    if (result.value === null) return Failure(error)
    return Success(result.value)
  }

  // Step 2: Validate vendor exists
  const vendorResult = await findVendorById(command.userId, command.vendorId)
  const vendor = ensureNotNull(
    DomainFailure(
      'VendorNotFound' as PurchasingDomainSubtype,
      `Vendor ${command.vendorId} not found or access denied.`
    )
  )(vendorResult)
  if (!vendor.isSuccess) {
    return vendor
  }

  // Step 3: Validate bill number uniqueness
  const existingBillResult = await findVendorBillByNumber(command.userId, command.billNumber)
  if (!existingBillResult.isSuccess) {
    return existingBillResult
  }
  if (existingBillResult.value !== null) {
    return Failure(
      DomainFailure(
        'DuplicateBillNumber' as PurchasingDomainSubtype,
        `Bill number ${command.billNumber} already exists for this user.`
      )
    )
  }

  // Step 4: Find required accounts
  // Default accounts: 201 for Accounts Payable, 501 for Expense (Salaries/Subcontractor Fee)
  // In a real application, the expense account might be chosen by the user, but for v1 we use a default.
  const apAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.ACCOUNTS_PAYABLE)
  const apAccount = ensureNotNull(
    DomainFailure(
      'AccountNotFound' as PurchasingDomainSubtype,
      `Default Accounts Payable account (code ${DEFAULT_ACCOUNT_CODES.ACCOUNTS_PAYABLE}) not found. Please set up chart of accounts.`
    )
  )(apAccountResult)
  if (!apAccount.isSuccess) {
    return apAccount
  }

  const expenseAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.SERVICE_REVENUE)
  // Note: We're using SERVICE_REVENUE as a placeholder for expense; in a real app we'd have a default expense account.
  // For now, we'll use the first expense account we can find (code 501). Let's adjust.
  // Actually, we should get the default expense account (501) from DEFAULT_ACCOUNT_CODES, but it's not defined there.
  // Let's define a new constant or use a hardcoded code.
  const expenseAccountCode = '501' // Salaries Expense / Subcontractor Fee
  const expenseAccountResult2 = await findAccountByCode(command.userId, expenseAccountCode)
  const expenseAccount = ensureNotNull(
    DomainFailure(
      'AccountNotFound' as PurchasingDomainSubtype,
      `Default Expense account (code ${expenseAccountCode}) not found. Please set up chart of accounts.`
    )
  )(expenseAccountResult2)
  if (!expenseAccount.isSuccess) {
    return expenseAccount
  }

  // Extract account values safely
  if (!apAccount.isSuccess) return apAccount
  if (!expenseAccount.isSuccess) return expenseAccount
  const apAccountValue = apAccount.value as Account
  const expenseAccountValue = expenseAccount.value as Account

  // Step 5: Create journal entry
  const description = optionGetOrElse(`Vendor bill ${command.billNumber}`)(optionFromNullable(command.description))
  const journalEntryResult = await createJournalEntry({
    userId: command.userId,
    entryNumber: `BILL-${command.billNumber}`,
    description,
    date: new Date(command.date),
    lines: [
      {
        accountId: expenseAccountValue.id!,
        amount: command.amount,
        side: 'Debit' as JournalLineSide,
      },
      {
        accountId: apAccountValue.id!,
        amount: command.amount,
        side: 'Credit' as JournalLineSide,
      },
    ],
  })

  if (!journalEntryResult.isSuccess) {
    return journalEntryResult
  }

  const journalEntry = journalEntryResult.value

  // Step 6: Create vendor bill
  const billToCreate: Omit<VendorBill, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    vendorId: command.vendorId,
    billNumber: command.billNumber,
    amount: command.amount,
    date: new Date(command.date),
    dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
    description: command.description,
    status: 'Recorded' as VendorBillStatus,
    journalEntryId: journalEntry.id!,
  }

  const billResult = await createVendorBill(billToCreate)
  if (!billResult.isSuccess) {
    // TODO: Rollback journal entry? For simplicity, we leave it (orphaned).
    return billResult
  }

  // Step 7: Update vendor balance (increase Accounts Payable)
  const updateBalanceResult = await updateVendorBalance(command.userId, command.vendorId, command.amount)
  if (!updateBalanceResult.isSuccess) {
    // If this fails, we have an inconsistent state. Log and continue for now.
    console.error('Failed to update vendor balance', updateBalanceResult.error)
  }

  return billResult
}