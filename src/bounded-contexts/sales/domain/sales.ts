import { Result, Success, Failure, andThen } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { SalesDomainSubtype } from './errors'

// --- Value Objects ---

// Reuse Money from ledger (positive, up to 2 decimal places)
export type Money = number

export type InvoiceNumber = string // user-defined identifier, e.g., "INV-2025-001"

export type CustomerName = string

export type Email = string

// String unions matching Prisma enums
export type InvoiceStatus = 'Draft' | 'Issued' | 'PartiallyPaid' | 'Paid' | 'Overdue'
export type PaymentMethod = 'Cash' | 'Check' | 'CreditCard' | 'BankTransfer'

// For convenience, constants
export const InvoiceStatus = {
  Draft: 'Draft' as InvoiceStatus,
  Issued: 'Issued' as InvoiceStatus,
  PartiallyPaid: 'PartiallyPaid' as InvoiceStatus,
  Paid: 'Paid' as InvoiceStatus,
  Overdue: 'Overdue' as InvoiceStatus,
}

export const PaymentMethod = {
  Cash: 'Cash' as PaymentMethod,
  Check: 'Check' as PaymentMethod,
  CreditCard: 'CreditCard' as PaymentMethod,
  BankTransfer: 'BankTransfer' as PaymentMethod,
}

// --- Entities ---

export type Customer = {
  readonly id?: string
  readonly userId: string
  readonly name: CustomerName
  readonly email?: string
  readonly balance: Money // subsidiary balance (Accounts Receivable)
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type SalesInvoice = {
  readonly id?: string
  readonly userId: string
  readonly customerId: string
  readonly invoiceNumber: InvoiceNumber
  readonly total: Money
  readonly status: InvoiceStatus
  readonly date: Date
  readonly dueDate?: Date
  readonly description?: string
  readonly journalEntryId: string // reference to the journal entry that records the revenue recognition
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type Payment = {
  readonly id?: string
  readonly invoiceId: string
  readonly amount: Money
  readonly date: Date
  readonly method: PaymentMethod
  readonly reference?: string
  readonly journalEntryId: string // reference to the journal entry that records the cash receipt
  readonly createdAt?: Date
}

export type CashSale = {
  readonly id?: string
  readonly userId: string
  readonly customerId: string
  readonly amount: Money
  readonly date: Date
  readonly description?: string
  readonly journalEntryId: string
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

export type CustomerDeposit = {
  readonly id?: string
  readonly userId: string
  readonly customerId: string
  readonly amount: Money
  readonly date: Date
  readonly description?: string
  readonly journalEntryId: string
  readonly createdAt?: Date
  readonly updatedAt?: Date
}

// --- Pure Validation Functions ---

const isCustomerNameValid = (name: string): boolean =>
  name.trim().length >= 1 && name.length <= 200

const isEmailValid = (email: string | undefined): boolean =>
  email === undefined || email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const isInvoiceNumberValid = (invoiceNumber: string): boolean =>
  invoiceNumber.trim().length >= 1 && invoiceNumber.length <= 50

const isAmountValid = (amount: Money): boolean =>
  amount > 0 && Number.isFinite(amount) && Math.round(amount * 100) === amount * 100

const isDateValid = (date: Date): boolean =>
  date instanceof Date && !isNaN(date.getTime())

const isDateNotFuture = (date: Date): boolean =>
  date <= new Date()

const isDueDateAfterInvoiceDate = (invoiceDate: Date, dueDate?: Date): boolean =>
  dueDate === undefined || dueDate >= invoiceDate

const isPaymentMethodValid = (method: string): method is PaymentMethod =>
  ['Cash', 'Check', 'CreditCard', 'BankTransfer'].includes(method)

/**
 * Validate customer name.
 */
export const validateCustomerName = (name: string): Result<CustomerName> => {
  const trimmed = name.trim()
  if (!isCustomerNameValid(trimmed)) {
    return Failure(
      DomainFailure(
        'InvalidCustomerName' as SalesDomainSubtype,
        'Customer name must be between 1 and 200 characters.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate customer email.
 */
export const validateCustomerEmail = (email: string | undefined): Result<string | undefined> => {
  if (email === undefined || email === '') {
    return Success(undefined)
  }
  const trimmed = email.trim()
  if (!isEmailValid(trimmed)) {
    return Failure(
      DomainFailure(
        'InvalidCustomerEmail' as SalesDomainSubtype,
        'Email must be a valid email address.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate invoice number.
 */
export const validateInvoiceNumber = (invoiceNumber: string): Result<InvoiceNumber> => {
  const trimmed = invoiceNumber.trim()
  if (!isInvoiceNumberValid(trimmed)) {
    return Failure(
      DomainFailure(
        'InvalidInvoiceNumber' as SalesDomainSubtype,
        'Invoice number must be between 1 and 50 characters.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate amount (positive, up to two decimals).
 */
export const validateAmount = (amount: Money): Result<Money> => {
  if (!isAmountValid(amount)) {
    return Failure(
      DomainFailure(
        'InvalidInvoiceTotal' as SalesDomainSubtype,
        'Amount must be positive and have at most two decimal places.'
      )
    )
  }
  return Success(amount)
}

/**
 * Validate date (not future).
 */
export const validateDateNotFuture = (date: Date): Result<Date> => {
  if (!isDateValid(date)) {
    return Failure(
      DomainFailure(
        'InvalidInvoiceDate' as SalesDomainSubtype,
        'Date must be a valid date.'
      )
    )
  }
  if (!isDateNotFuture(date)) {
    return Failure(
      DomainFailure(
        'InvoiceDateInFuture' as SalesDomainSubtype,
        'Invoice date cannot be in the future.'
      )
    )
  }
  return Success(date)
}

/**
 * Validate due date is after invoice date.
 */
export const validateDueDate = (invoiceDate: Date, dueDate?: Date): Result<Date | undefined> => {
  if (dueDate === undefined) {
    return Success(undefined)
  }
  if (!isDateValid(dueDate)) {
    return Failure(
      DomainFailure(
        'InvalidDueDate' as SalesDomainSubtype,
        'Due date must be a valid date.'
      )
    )
  }
  if (!isDueDateAfterInvoiceDate(invoiceDate, dueDate)) {
    return Failure(
      DomainFailure(
        'InvalidDueDate' as SalesDomainSubtype,
        'Due date must be on or after invoice date.'
      )
    )
  }
  return Success(dueDate)
}

/**
 * Validate payment method.
 */
export const validatePaymentMethod = (method: string): Result<PaymentMethod> => {
  if (!isPaymentMethodValid(method)) {
    return Failure(
      DomainFailure(
        'InvalidPaymentMethod' as SalesDomainSubtype,
        'Payment method must be one of: Cash, Check, CreditCard, BankTransfer.'
      )
    )
  }
  return Success(method)
}

/**
 * Validate payment reference (optional, up to 100 chars).
 */
export const validatePaymentReference = (reference?: string): Result<string | undefined> => {
  if (reference === undefined || reference === '') {
    return Success(undefined)
  }
  const trimmed = reference.trim()
  if (trimmed.length > 100) {
    return Failure(
      DomainFailure(
        'InvalidPaymentReference' as SalesDomainSubtype,
        'Payment reference must be at most 100 characters.'
      )
    )
  }
  return Success(trimmed)
}

/**
 * Validate that payment amount does not exceed open amount.
 * This is a business rule that requires context (open amount).
 */
export const validatePaymentDoesNotExceedOpenAmount = (
  paymentAmount: Money,
  openAmount: Money
): Result<Money> => {
  if (paymentAmount > openAmount) {
    return Failure(
      DomainFailure(
        'PaymentExceedsOpenAmount' as SalesDomainSubtype,
        `Payment amount (${paymentAmount}) exceeds open amount (${openAmount}).`
      )
    )
  }
  return Success(paymentAmount)
}

/**
 * Validate a customer entity (composition of validations).
 */
export const validateCustomer = (customer: Omit<Customer, 'id' | 'balance' | 'createdAt' | 'updatedAt'>): Result<Customer> => {
  const nameResult = validateCustomerName(customer.name)
  if (!nameResult.isSuccess) return nameResult

  const emailResult = validateCustomerEmail(customer.email)
  if (!emailResult.isSuccess) return emailResult

  return Success({
    ...customer,
    name: nameResult.value,
    email: emailResult.value,
    id: undefined,
    balance: 0,
    createdAt: undefined,
    updatedAt: undefined,
  })
}

/**
 * Validate a sales invoice (basic validation, not including business rules like duplicate invoice number).
 */
export const validateSalesInvoice = (
  invoice: Omit<SalesInvoice, 'id' | 'status' | 'journalEntryId' | 'createdAt' | 'updatedAt'>
): Result<SalesInvoice> => {
  // Validate required fields
  const invoiceNumberResult = validateInvoiceNumber(invoice.invoiceNumber)
  const amountResult = validateAmount(invoice.total)
  const dateResult = validateDateNotFuture(invoice.date)
  const dueDateResult = validateDueDate(invoice.date, invoice.dueDate)

  // Combine results using railway
  const combinedResult = andThen(() => amountResult)(invoiceNumberResult)
  const combinedResult2 = andThen(() => dateResult)(combinedResult)
  const combinedResult3 = andThen(() => dueDateResult)(combinedResult2)

  if (combinedResult3.isSuccess) {
    return Success({
      ...invoice,
      id: undefined,
      status: 'Draft' as InvoiceStatus,
      journalEntryId: '', // will be filled by application layer
      createdAt: undefined,
      updatedAt: undefined,
    })
  } else {
    return Failure(combinedResult3.error)
  }
}