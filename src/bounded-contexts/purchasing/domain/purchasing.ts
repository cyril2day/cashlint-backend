import * as R from 'ramda'
import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PurchasingDomainSubtype } from './errors'
import {
  validateStringLength,
  validatePositiveMoneyWith,
  validateDateNotFuture as validateDateNotFutureShared,
  validateEmailOptional,
  pipeValidators
} from '@/shared/validation'

// --- Value Objects ---

// Reuse Money from ledger (positive, up to 2 decimal places)
export type Money = number

export type BillNumber = string // user-defined identifier, e.g., "BILL-2025-001"

export type VendorName = string

export type Email = string

export type ExpenseCategory = string // e.g., "Office Supplies", "Travel"

// String unions matching Prisma enums
export type VendorBillStatus = 'Draft' | 'Recorded' | 'PartiallyPaid' | 'Paid'

// For convenience, constants
export const VendorBillStatus = {
  Draft: 'Draft' as VendorBillStatus,
  Recorded: 'Recorded' as VendorBillStatus,
  PartiallyPaid: 'PartiallyPaid' as VendorBillStatus,
  Paid: 'Paid' as VendorBillStatus,
}

// --- Entities ---

export type Vendor = {
  readonly id?: string
  readonly userId: string
  readonly name: VendorName
  readonly email?: string
  readonly balance: Money // subsidiary balance (Accounts Payable)
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type VendorBill = {
  readonly id?: string
  readonly userId: string
  readonly vendorId: string
  readonly billNumber: BillNumber
  readonly amount: Money
  readonly date: Date
  readonly dueDate?: Date
  readonly description?: string
  readonly status: VendorBillStatus
  readonly journalEntryId: string // reference to the journal entry that records the expense/liability
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type Loan = {
  readonly id?: string
  readonly userId: string
  readonly vendorId: string
  readonly principal: Money
  readonly interestRate?: number // annual percentage, e.g., 5.0
  readonly term?: number // months
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type LoanPayment = {
  readonly id?: string
  readonly loanId: string
  readonly principalAmount: Money
  readonly interestAmount: Money
  readonly date: Date
  readonly description?: string
  readonly journalEntryId: string // reference to the journal entry that records the payment
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type CashExpense = {
  readonly id?: string
  readonly userId: string
  readonly vendorId: string
  readonly amount: Money
  readonly date: Date
  readonly expenseCategory: string
  readonly description?: string
  readonly journalEntryId: string // reference to the journal entry that records the expense
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

// --- Pure Validation Functions ---

/**
 * Validate vendor name.
 */
export const validateVendorName = validateStringLength(1, 200, 'InvalidVendorName' as PurchasingDomainSubtype)

/**
 * Validate vendor email.
 */
export const validateVendorEmail = (email: string | undefined): Result<string | undefined> => {
  const result = validateEmailOptional(email)
  if (!result.isSuccess) {
    // Map generic 'InvalidEmail' to purchasing-specific subtype
    return Failure(DomainFailure('InvalidVendorEmail' as PurchasingDomainSubtype, result.error.message))
  }
  return result
}

/**
 * Validate bill number.
 */
export const validateBillNumber = validateStringLength(1, 50, 'InvalidBillNumber' as PurchasingDomainSubtype)

/**
 * Validate bill amount (positive, up to two decimals).
 */
export const validateBillAmount = validatePositiveMoneyWith('InvalidBillTotal' as PurchasingDomainSubtype)

/**
 * Validate loan principal (positive, up to two decimals).
 */
export const validateLoanPrincipal = validatePositiveMoneyWith('InvalidLoanPrincipal' as PurchasingDomainSubtype)

/**
 * Validate interest rate (optional, non-negative, up to two decimals, max 1000%?).
 */
export const validateInterestRate = (rate?: number): Result<number | undefined> => {
  if (rate === undefined) {
    return Success(undefined)
  }
  if (!Number.isFinite(rate) || rate < 0 || rate > 1000) {
    return Failure(
      DomainFailure(
        'InvalidInterestRate' as PurchasingDomainSubtype,
        'Interest rate must be between 0 and 1000 (percentage).'
      )
    )
  }
  // allow up to two decimal places
  if (Math.round(rate * 100) !== rate * 100) {
    return Failure(
      DomainFailure(
        'InvalidInterestRate' as PurchasingDomainSubtype,
        'Interest rate must have at most two decimal places.'
      )
    )
  }
  return Success(rate)
}

/**
 * Validate loan term (optional, positive integer, max 1200 months?).
 */
export const validateLoanTerm = (term?: number): Result<number | undefined> => {
  if (term === undefined) {
    return Success(undefined)
  }
  if (!Number.isInteger(term) || term <= 0 || term > 1200) {
    return Failure(
      DomainFailure(
        'InvalidLoanTerm' as PurchasingDomainSubtype,
        'Loan term must be a positive integer up to 1200 months.'
      )
    )
  }
  return Success(term)
}

/**
 * Validate payment principal amount (positive, up to two decimals).
 */
export const validatePaymentPrincipal = validatePositiveMoneyWith('InvalidPaymentPrincipal' as PurchasingDomainSubtype)

/**
 * Validate payment interest amount (non‑negative, up to two decimals).
 */
export const validatePaymentInterest = (amount: Money): Result<Money> => {
  if (!Number.isFinite(amount) || amount < 0) {
    return Failure(
      DomainFailure(
        'InvalidPaymentInterest' as PurchasingDomainSubtype,
        'Interest amount must be a non‑negative number.'
      )
    )
  }
  // up to two decimals
  if (Math.round(amount * 100) !== amount * 100) {
    return Failure(
      DomainFailure(
        'InvalidPaymentInterest' as PurchasingDomainSubtype,
        'Interest amount must have at most two decimal places.'
      )
    )
  }
  return Success(amount)
}

/**
 * Validate expense amount (positive, up to two decimals).
 */
export const validateExpenseAmount = validatePositiveMoneyWith('InvalidExpenseAmount' as PurchasingDomainSubtype)

/**
 * Validate expense category (non‑empty, reasonable length).
 */
export const validateExpenseCategory = validateStringLength(1, 100, 'InvalidExpenseCategory' as PurchasingDomainSubtype)

/**
 * Validate bill date (not future).
 */
export const validateBillDateNotFuture = (date: Date): Result<Date> => {
  const result = validateDateNotFutureShared(date)
  if (!result.isSuccess) {
    const subtype = result.error.subtype === 'DateInFuture'
      ? 'BillDateInFuture' as PurchasingDomainSubtype
      : 'InvalidBillDate' as PurchasingDomainSubtype
    return Failure(DomainFailure(subtype, result.error.message))
  }
  return result
}

/**
 * Validate payment date (not future).
 */
export const validatePaymentDateNotFuture = (date: Date): Result<Date> => {
  const result = validateDateNotFutureShared(date)
  if (!result.isSuccess) {
    const subtype = result.error.subtype === 'DateInFuture'
      ? 'PaymentDateInFuture' as PurchasingDomainSubtype
      : 'InvalidPaymentDate' as PurchasingDomainSubtype
    return Failure(DomainFailure(subtype, result.error.message))
  }
  return result
}

/**
 * Validate due date is after bill date.
 */
export const validateDueDate = (billDate: Date, dueDate?: Date): Result<Date | undefined> => {
  if (dueDate === undefined) {
    return Success(undefined)
  }

  const validator = pipeValidators<Date>(
    (d) => validateDateNotFutureShared(d),
    (d) => d >= billDate
      ? Success(d)
      : Failure(DomainFailure('InvalidDueDate' as PurchasingDomainSubtype, 'Due date must be on or after bill date.'))
  )

  return validator(dueDate)
}

/**
 * Validate that payment does not exceed open amount (for vendor bills).
 */
export const validatePaymentDoesNotExceedOpenAmount = (
  paymentAmount: Money,
  openAmount: Money
): Result<Money> => {
  if (paymentAmount > openAmount) {
    return Failure(
      DomainFailure(
        'PaymentExceedsOpenAmount' as PurchasingDomainSubtype,
        `Payment amount (${paymentAmount}) exceeds open amount (${openAmount}).`
      )
    )
  }
  return Success(paymentAmount)
}

/**
 * Validate a vendor entity.
 */
export const validateVendor = (vendor: Omit<Vendor, 'id' | 'balance' | 'createdAt' | 'updatedAt'>): Result<Vendor> => {
  const nameResult = validateVendorName(vendor.name)
  if (!nameResult.isSuccess) return nameResult

  const emailResult = validateVendorEmail(vendor.email)
  if (!emailResult.isSuccess) return emailResult

  return Success({
    ...vendor,
    name: nameResult.value,
    email: emailResult.value,
    id: undefined,
    balance: 0,
    createdAt: undefined,
    updatedAt: undefined,
  })
}

/**
 * Validate a vendor bill (basic validation, not including business rules like duplicate bill number).
 */
export const validateVendorBill = (
  bill: Omit<VendorBill, 'id' | 'status' | 'journalEntryId' | 'createdAt' | 'updatedAt'>
): Result<VendorBill> => {
  // Validate required fields
  const billNumberResult = validateBillNumber(bill.billNumber)
  const amountResult = validateBillAmount(bill.amount)
  const dateResult = validateBillDateNotFuture(bill.date)
  const dueDateResult = validateDueDate(bill.date, bill.dueDate)

  // Combine results using railway
  const combinedResult = andThen(() => amountResult)(billNumberResult)
  const combinedResult2 = andThen(() => dateResult)(combinedResult)
  const combinedResult3 = andThen(() => dueDateResult)(combinedResult2)

  if (combinedResult3.isSuccess) {
    return Success({
      ...bill,
      id: undefined,
      status: 'Draft' as VendorBillStatus,
      journalEntryId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(combinedResult3.error)
  }
}

/**
 * Validate a loan (basic validation).
 */
export const validateLoan = (
  loan: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>
): Result<Loan> => {
  const principalResult = validateLoanPrincipal(loan.principal)
  const interestResult = validateInterestRate(loan.interestRate)
  const termResult = validateLoanTerm(loan.term)

  const combinedResult = andThen(() => interestResult)(principalResult)
  const combinedResult2 = andThen(() => termResult)(combinedResult)

  if (combinedResult2.isSuccess) {
    return Success({
      ...loan,
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(combinedResult2.error)
  }
}

/**
 * Validate a loan payment (basic validation).
 */
export const validateLoanPayment = (
  payment: Omit<LoanPayment, 'id' | 'journalEntryId' | 'createdAt' | 'updatedAt'>
): Result<LoanPayment> => {
  const principalResult = validatePaymentPrincipal(payment.principalAmount)
  const interestResult = validatePaymentInterest(payment.interestAmount)
  const dateResult = validatePaymentDateNotFuture(payment.date)

  const combinedResult = andThen(() => interestResult)(principalResult)
  const combinedResult2 = andThen(() => dateResult)(combinedResult)

  if (combinedResult2.isSuccess) {
    return Success({
      ...payment,
      id: undefined,
      journalEntryId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(combinedResult2.error)
  }
}

/**
 * Validate a cash expense (basic validation).
 */
export const validateCashExpense = (
  expense: Omit<CashExpense, 'id' | 'journalEntryId' | 'createdAt' | 'updatedAt'>
): Result<CashExpense> => {
  const amountResult = validateExpenseAmount(expense.amount)
  const categoryResult = validateExpenseCategory(expense.expenseCategory)
  const dateResult = validatePaymentDateNotFuture(expense.date) // reuse payment date validation

  const combinedResult = andThen(() => categoryResult)(amountResult)
  const combinedResult2 = andThen(() => dateResult)(combinedResult)

  if (combinedResult2.isSuccess) {
    return Success({
      ...expense,
      id: undefined,
      journalEntryId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(combinedResult2.error)
  }
}