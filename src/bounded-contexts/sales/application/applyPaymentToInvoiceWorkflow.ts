import { validateAmount, validateDateNotFuture, validatePaymentMethod, validatePaymentReference, Money, PaymentMethod, validatePaymentAmount, validatePaymentDateNotFuture } from '../domain/sales'
import { findSalesInvoiceById, updateSalesInvoiceStatus } from '../infrastructure/salesInvoiceRepo'
import { getTotalPaidForInvoice, createPayment } from '../infrastructure/paymentRepo'
import { findCustomerById, updateCustomerBalance } from '../infrastructure/customerRepo'
import { findAccountByCode } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { createJournalEntry } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { SalesDomainSubtype } from '../domain/errors'
import { JournalLineSide } from '@/bounded-contexts/ledger/domain/ledger'
import { DEFAULT_ACCOUNT_CODES } from '@/bounded-contexts/ledger/domain/defaultAccounts'
import { prisma } from '@/common/infrastructure/db'
import { Prisma } from '@/prisma/client'

/**
 * Workflow input: raw data from command (API request).
 */
export type ApplyPaymentToInvoiceCommand = {
  userId: string
  invoiceId: string
  amount: Money
  date: string // ISO string
  method: string
  reference?: string
}

/**
 * Apply Payment to Invoice Workflow - Application Layer
 *
 * Steps:
 * 1. Validate payment data (pure validation)
 * 2. Find the invoice and ensure it belongs to the user
 * 3. Calculate open amount (invoice total - payments already made)
 * 4. Validate that payment does not exceed open amount (business rule)
 * 5. Find required accounts (Cash and Accounts Receivable) by code for the user
 * 6. Create a journal entry for the cash receipt (debit Cash, credit Accounts Receivable)
 * 7. Create the payment record with the journal entry reference
 * 8. Update invoice status (Paid or PartiallyPaid)
 * 9. Update customer subsidiary balance (decrease Accounts Receivable)
 *
 * Returns a Promise<Result<Payment>>.
 */
export const applyPaymentToInvoiceWorkflow = async (command: ApplyPaymentToInvoiceCommand): Promise<Result<any>> => {
  // Step 1: Pure validation
  const amountResult = validatePaymentAmount(command.amount)
  if (!amountResult.isSuccess) return amountResult

  const dateResult = validatePaymentDateNotFuture(new Date(command.date))
  if (!dateResult.isSuccess) return dateResult

  const methodResult = validatePaymentMethod(command.method)
  if (!methodResult.isSuccess) return methodResult

  const referenceResult = validatePaymentReference(command.reference)
  if (!referenceResult.isSuccess) return referenceResult

  const validatedPayment = {
    amount: amountResult.value,
    date: dateResult.value,
    method: methodResult.value,
    reference: referenceResult.value,
  }

  // Step 2: Find invoice
  const invoiceResult = await findSalesInvoiceById(command.userId, command.invoiceId)
  if (!invoiceResult.isSuccess) {
    return invoiceResult
  }
  const invoice = invoiceResult.value
  if (invoice === null) {
    return Failure(
      DomainFailure(
        'InvoiceNotFound' as SalesDomainSubtype,
        `Invoice ${command.invoiceId} not found or access denied.`
      )
    )
  }

  // Step 3: Calculate open amount
  const totalPaidResult = await getTotalPaidForInvoice(command.userId, command.invoiceId)
  if (!totalPaidResult.isSuccess) {
    return totalPaidResult
  }
  const totalPaid = totalPaidResult.value
  const openAmount = invoice.total - totalPaid

  // Step 4: Validate payment does not exceed open amount
  if (validatedPayment.amount > openAmount) {
    return Failure(
      DomainFailure(
        'PaymentExceedsOpenAmount' as SalesDomainSubtype,
        `Payment amount (${validatedPayment.amount}) exceeds open amount (${openAmount}).`
      )
    )
  }

  // Step 5: Find required accounts
  // Default accounts: 101 Cash, 111 Accounts Receivable
  const cashAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.CASH)
  if (!cashAccountResult.isSuccess) {
    return cashAccountResult
  }
  const cashAccount = cashAccountResult.value
  if (cashAccount === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as SalesDomainSubtype,
        `Default Cash account (code ${DEFAULT_ACCOUNT_CODES.CASH}) not found. Please set up chart of accounts.`
      )
    )
  }

  const arAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE)
  if (!arAccountResult.isSuccess) {
    return arAccountResult
  }
  const arAccount = arAccountResult.value
  if (arAccount === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as SalesDomainSubtype,
        `Default Accounts Receivable account (code ${DEFAULT_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE}) not found. Please set up chart of accounts.`
      )
    )
  }

  try {
    const payment = await prisma.$transaction(async (tx) => {
      // Step 6: Create journal entry within transaction
      const journalEntryResult = await createJournalEntry(
        {
          userId: command.userId,
          entryNumber: `PAY-${Date.now()}`,
          description: `Payment for invoice ${invoice.invoiceNumber}`,
          date: validatedPayment.date,
          lines: [
            {
              accountId: cashAccount.id!,
              amount: validatedPayment.amount,
              side: 'Debit' as JournalLineSide,
            },
            {
              accountId: arAccount.id!,
              amount: validatedPayment.amount,
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

      // Step 7: Create payment record within transaction
      const paymentResult = await createPayment(
        {
          invoiceId: command.invoiceId,
          amount: validatedPayment.amount,
          date: validatedPayment.date,
          method: validatedPayment.method,
          reference: validatedPayment.reference,
          journalEntryId: journalEntry.id!,
        },
        tx
      )
      if (!paymentResult.isSuccess) {
        throw paymentResult.error
      }
      const payment = paymentResult.value

      // Step 8: Update invoice status within transaction
      const newStatus = validatedPayment.amount === openAmount ? 'Paid' : 'PartiallyPaid'
      const statusUpdateResult = await updateSalesInvoiceStatus(command.userId, command.invoiceId, newStatus, tx)
      if (!statusUpdateResult.isSuccess) {
        throw statusUpdateResult.error
      }

      // Step 9: Update customer balance within transaction
      const balanceUpdateResult = await updateCustomerBalance(command.userId, invoice.customerId, -validatedPayment.amount, tx)
      if (!balanceUpdateResult.isSuccess) {
        throw balanceUpdateResult.error
      }

      return payment
    })
    return Success(payment)
  } catch (error) {
    // The transaction has rolled back; convert error to a Result failure
    // Since the error thrown is an AppError (from our repositories), we can return Failure directly.
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