import { validateLoanPayment, LoanPayment, Money } from '../domain/purchasing'
import { createLoanPayment } from '../infrastructure/loanPaymentRepo'
import { findLoanByVendorId, updateLoanPrincipal } from '../infrastructure/loanRepo'
import { findVendorById } from '../infrastructure/vendorRepo'
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
export type RecordLoanPaymentCommand = {
  userId: string
  vendorId: string
  principalAmount: Money
  interestAmount: Money
  date: string // ISO string
  description?: string
}

/**
 * Record Loan Payment Workflow - Application Layer
 *
 * Steps:
 * 1. Validate command structure (pure validation)
 * 2. Validate that the vendor exists and belongs to the user
 * 3. Find the loan for this vendor (assume one loan per vendor for now)
 * 4. Validate that the payment does not exceed the loan's remaining principal (business rule)
 * 5. Find the required accounts (Cash, Notes Payable, Interest Expense) by code for the user
 * 6. Create a journal entry for the payment (debit Notes Payable, debit Interest Expense, credit Cash)
 * 7. Create the loan payment record with the journal entry reference
 * 8. Update the loan principal (reduce by principalAmount)
 *
 * Returns a Promise<Result<LoanPayment>>.
 */
export const recordLoanPaymentWorkflow = async (command: RecordLoanPaymentCommand): Promise<Result<LoanPayment>> => {
  // Step 1: Pure validation
  const paymentToValidate: Omit<LoanPayment, 'id' | 'journalEntryId' | 'createdAt' | 'updatedAt'> = {
    loanId: '', // placeholder, will be filled after we find the loan
    principalAmount: command.principalAmount,
    interestAmount: command.interestAmount,
    date: new Date(command.date),
    description: command.description,
  }

  const validationResult = validateLoanPayment(paymentToValidate)
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

  // Step 3: Find loan for this vendor
  const loanResult = await findLoanByVendorId(command.userId, command.vendorId)
  if (!loanResult.isSuccess) {
    return loanResult
  }
  if (loanResult.value === null) {
    return Failure(
      DomainFailure(
        'LoanNotFound' as PurchasingDomainSubtype,
        `No loan found for vendor ${command.vendorId}.`
      )
    )
  }
  const loan = loanResult.value

  // Step 4: Validate payment does not exceed remaining principal
  if (command.principalAmount > loan.principal) {
    return Failure(
      DomainFailure(
        'PaymentExceedsLoanPrincipal' as PurchasingDomainSubtype,
        `Principal payment amount (${command.principalAmount}) exceeds remaining loan principal (${loan.principal}).`
      )
    )
  }

  // Step 5: Find required accounts using the constants
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

  const notesPayableAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.NOTES_PAYABLE)
  if (!notesPayableAccountResult.isSuccess) {
    return notesPayableAccountResult
  }
  if (notesPayableAccountResult.value === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as PurchasingDomainSubtype,
        `Default Notes Payable account (code ${DEFAULT_ACCOUNT_CODES.NOTES_PAYABLE}) not found. Please set up chart of accounts.`
      )
    )
  }
  const notesPayableAccountValue = notesPayableAccountResult.value

  const interestExpenseAccountResult = await findAccountByCode(command.userId, DEFAULT_ACCOUNT_CODES.INTEREST_EXPENSE)
  if (!interestExpenseAccountResult.isSuccess) {
    return interestExpenseAccountResult
  }
  if (interestExpenseAccountResult.value === null) {
    return Failure(
      DomainFailure(
        'AccountNotFound' as PurchasingDomainSubtype,
        `Default Interest Expense account (code ${DEFAULT_ACCOUNT_CODES.INTEREST_EXPENSE}) not found. Please set up chart of accounts.`
      )
    )
  }
  const interestExpenseAccountValue = interestExpenseAccountResult.value

  // Step 6: Create journal entry
  const totalAmount = command.principalAmount + command.interestAmount
  const description = optionGetOrElse(`Loan payment for vendor ${command.vendorId}`)(optionFromNullable(command.description))
  const journalEntryResult = await createJournalEntry({
    userId: command.userId,
    entryNumber: `LOAN-PAY-${Date.now()}`,
    description,
    date: new Date(command.date),
    lines: [
      {
        accountId: notesPayableAccountValue.id!,
        amount: command.principalAmount,
        side: 'Debit' as JournalLineSide, // Reducing liability
      },
      {
        accountId: interestExpenseAccountValue.id!,
        amount: command.interestAmount,
        side: 'Debit' as JournalLineSide, // Expense
      },
      {
        accountId: cashAccountValue.id!,
        amount: totalAmount,
        side: 'Credit' as JournalLineSide, // Cash outflow
      },
    ],
  })

  if (!journalEntryResult.isSuccess) {
    return journalEntryResult
  }

  const journalEntry = journalEntryResult.value

  // Step 7: Create loan payment record
  const paymentToCreate: Omit<LoanPayment, 'id' | 'createdAt' | 'updatedAt'> = {
    loanId: loan.id!,
    principalAmount: command.principalAmount,
    interestAmount: command.interestAmount,
    date: new Date(command.date),
    description: command.description,
    journalEntryId: journalEntry.id!,
  }

  const paymentResult = await createLoanPayment(paymentToCreate)
  if (!paymentResult.isSuccess) {
    // TODO: Rollback journal entry? For now, leave orphaned.
    return paymentResult
  }

  // Step 8: Update loan principal
  const newPrincipal = loan.principal - command.principalAmount
  const updatePrincipalResult = await updateLoanPrincipal(command.userId, loan.id!, newPrincipal)
  if (!updatePrincipalResult.isSuccess) {
    console.error('Failed to update loan principal', updatePrincipalResult.error)
    // We still return the payment, but the loan principal is not updated.
  }

  return paymentResult
}