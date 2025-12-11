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
import { prisma } from '@/common/infrastructure/db'
import { Prisma } from '@/prisma/client'

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

  // At this point, arAccount and revenueAccount are Success with non-null values
  const arAccountValue = arAccount.value as Account
  const revenueAccountValue = revenueAccount.value as Account

  const description = optionGetOrElse(`Sales invoice ${command.invoiceNumber}`)(optionFromNullable(command.description))

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      // Step 5: Create journal entry within transaction
      const journalEntryResult = await createJournalEntry(
        {
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
        },
        tx
      )
      if (!journalEntryResult.isSuccess) {
        throw journalEntryResult.error // This will roll back the transaction
      }
      const journalEntry = journalEntryResult.value

      // Step 6: Create sales invoice within transaction
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

      const invoiceResult = await createSalesInvoice(invoiceToCreate, tx)
      if (!invoiceResult.isSuccess) {
        throw invoiceResult.error
      }
      const invoice = invoiceResult.value

      // Step 7: Update customer balance within transaction
      const updateBalanceResult = await updateCustomerBalance(command.userId, command.customerId, command.total, tx)
      if (!updateBalanceResult.isSuccess) {
        throw updateBalanceResult.error
      }

      return invoice
    })
    return Success(invoice)
  } catch (error) {
    // The transaction has rolled back; convert error to a Result failure
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      (error.type === 'DomainFailure' || error.type === 'InfrastructureFailure')
    ) {
      return Failure(error as any)
    }
    // Unknown error (e.g., Prisma error)
    const message = error instanceof Error ? error.message : String(error)
    return Failure(
      DomainFailure(
        'TransactionFailed' as SalesDomainSubtype,
        `Transaction failed: ${message}`
      )
    )
  }
}
