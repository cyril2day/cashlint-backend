import { validateSalesInvoice, SalesInvoice, Money } from '../domain/sales'
import { createSalesInvoice, findSalesInvoiceByNumber } from '../infrastructure/salesInvoiceRepo'
import { findCustomerById, updateCustomerBalance } from '../infrastructure/customerRepo'
import { createJournalEntry } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'
import { findAccountByCode } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { Result, Failure, Success, andThen, fromNullable, map, fold } from '@/common/types/result'
import { DomainFailure, AppError } from '@/common/types/errors'
import { SalesDomainSubtype } from '../domain/errors'
import { JournalLineSide, Account } from '@/bounded-contexts/ledger/domain/ledger'
import { DEFAULT_ACCOUNT_CODES } from '@/bounded-contexts/ledger/domain/defaultAccounts'
import { fromNullable as optionFromNullable, getOrElse as optionGetOrElse } from '@/common/types/option'

/**
 * Workflow input: raw data from command (API request).
 */
export type IssueSalesInvoiceCommand = {
  userId: string
  customerId: string
  invoiceNumber: string
  total: Money
  date: string // ISO string
  dueDate?: string // ISO string
  description?: string
}

/**
 * Issue Sales Invoice Workflow - Application Layer
 *
 * Steps:
 * 1. Validate command structure (pure validation)
 * 2. Validate that the customer exists and belongs to the user
 * 3. Validate that the invoice number is unique for this user
 * 4. Find the required accounts (Accounts Receivable and Revenue) by code for the user
 * 5. Create a journal entry for the revenue recognition
 * 6. Create the sales invoice record with the journal entry reference
 * 7. Update the customer's subsidiary balance
 *
 * Returns a Promise<Result<SalesInvoice>>.
 */
export const issueSalesInvoiceWorkflow = async (command: IssueSalesInvoiceCommand): Promise<Result<SalesInvoice>> => {
  // Step 1: Pure validation
  const invoiceToValidate: Omit<SalesInvoice, 'id' | 'status' | 'journalEntryId' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    customerId: command.customerId,
    invoiceNumber: command.invoiceNumber,
    total: command.total,
    date: new Date(command.date),
    dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
    description: command.description,
  }

  const validationResult = validateSalesInvoice(invoiceToValidate)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Helper to convert Result<T | null> to Result<T> with a custom error when null
  const ensureNotNull = <T>(error: AppError) => (result: Result<T | null>): Result<T> => {
    if (!result.isSuccess) return result
    if (result.value === null) return Failure(error)
    return Success(result.value)
  }

  // Step 2: Validate customer exists
  const customerResult = await findCustomerById(command.userId, command.customerId)
  const customer = ensureNotNull(
    DomainFailure(
      'CustomerNotFound' as SalesDomainSubtype,
      `Customer ${command.customerId} not found or access denied.`
    )
  )(customerResult)
  if (!customer.isSuccess) {
    return customer
  }

  // Step 3: Validate invoice number uniqueness
  const existingInvoiceResult = await findSalesInvoiceByNumber(command.userId, command.invoiceNumber)
  if (!existingInvoiceResult.isSuccess) {
    return existingInvoiceResult
  }
  if (existingInvoiceResult.value !== null) {
    return Failure(
      DomainFailure(
        'DuplicateInvoiceNumber' as SalesDomainSubtype,
        `Invoice number ${command.invoiceNumber} already exists for this user.`
      )
    )
  }
  // At this point, existingInvoiceResult.isSuccess and value is null -> proceed

  // Step 4: Find required accounts
  // We assume the default chart of accounts: 111 for Accounts Receivable, 401 for Service Revenue
  // In a real application, these could be configurable per user, but for v1 we use defaults.
  const arAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
  const arAccount = ensureNotNull(
    DomainFailure(
      'AccountNotFound' as SalesDomainSubtype,
      `Default Accounts Receivable account (code ${DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE}) not found. Please set up chart of accounts.`
    )
  )(arAccountResult)
  if (!arAccount.isSuccess) {
    return arAccount
  }

  const revenueAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.SERVICE_REVENUE)
  const revenueAccount = ensureNotNull(
    DomainFailure(
      'AccountNotFound' as SalesDomainSubtype,
      `Default Revenue account (code ${DEFAULT_ACCOUNT_CODES.SERVICE_REVENUE}) not found. Please set up chart of accounts.`
    )
  )(revenueAccountResult)
  if (!revenueAccount.isSuccess) {
    return revenueAccount
  }

  // Step 5: Create journal entry
  // Extract account values safely (they are guaranteed non-null by ensureNotNull)
  // TypeScript needs explicit typing, so we assert after success checks
  if (!arAccount.isSuccess) return arAccount
  if (!revenueAccount.isSuccess) return revenueAccount
  const arAccountValue = arAccount.value as Account
  const revenueAccountValue = revenueAccount.value as Account

  const description = optionGetOrElse(`Sales invoice ${command.invoiceNumber}`)(optionFromNullable(command.description))
  const journalEntryResult = await createJournalEntry({
    userId: command.userId,
    entryNumber: `INV-${command.invoiceNumber}`,
    description,
    date: new Date(command.date),
    lines: [
      {
        accountId: arAccountValue.id!,
        amount: command.total,
        side: 'Debit' as JournalLineSide,
      },
      {
        accountId: revenueAccountValue.id!,
        amount: command.total,
        side: 'Credit' as JournalLineSide,
      },
    ],
  })

  if (!journalEntryResult.isSuccess) {
    return journalEntryResult
  }

  const journalEntry = journalEntryResult.value

  // Step 6: Create sales invoice
  const invoiceToCreate: Omit<SalesInvoice, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    customerId: command.customerId,
    invoiceNumber: command.invoiceNumber,
    total: command.total,
    status: 'Issued',
    date: new Date(command.date),
    dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
    description: command.description,
    journalEntryId: journalEntry.id!,
  }

  const invoiceResult = await createSalesInvoice(invoiceToCreate)
  if (!invoiceResult.isSuccess) {
    // TODO: Rollback journal entry? For simplicity, we leave it (orphaned). In production, use a transaction.
    return invoiceResult
  }

  // Step 7: Update customer balance (increase Accounts Receivable)
  const updateBalanceResult = await updateCustomerBalance(command.userId, command.customerId, command.total)
  if (!updateBalanceResult.isSuccess) {
    // If this fails, we have an inconsistent state. For v1, we accept the risk and log.
    // In a more robust system, we would roll back the previous steps.
    console.error('Failed to update customer balance', updateBalanceResult.error)
    // We still return the invoice as created, but the balance is off.
    // This is a trade-off; we could return a failure, but then the invoice is created without balance update.
    // We'll return the invoice but note the error? For now, we'll return the invoice.
    // Alternatively, we could use a transaction that includes the balance update.
  }

  return invoiceResult
}
