import { describe, it, expect } from 'vitest'
import {
  validateVendorName,
  validateVendorEmail,
  validateBillNumber,
  validateBillAmount,
  validateLoanPrincipal,
  validateInterestRate,
  validateLoanTerm,
  validatePaymentPrincipal,
  validatePaymentInterest,
  validateExpenseAmount,
  validateExpenseCategory,
  validateBillDateNotFuture,
  validatePaymentDateNotFuture,
  validateDueDate,
  validatePaymentDoesNotExceedOpenAmount,
  validateVendor,
  validateVendorBill,
  validateLoan,
  validateLoanPayment,
  validateCashExpense,
  VendorBillStatus as VendorBillStatusConst,
} from './purchasing'
import { Success } from '@/common/types/result'

describe('Purchasing Domain Validation Functions', () => {
  describe('validateVendorName', () => {
    it('should accept a valid vendor name', () => {
      const result = validateVendorName('Supplies Inc.')
      expect(result).toEqual(Success('Supplies Inc.'))
    })

    it('should trim whitespace', () => {
      const result = validateVendorName('  Jane Supplier  ')
      expect(result).toEqual(Success('Jane Supplier'))
    })

    it('should reject empty name after trim', () => {
      const result = validateVendorName('   ')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect(result.error.message).toBe('Must be between 1 and 200 characters')
      }
    })

    it('should reject names longer than 200 characters', () => {
      const longName = 'A'.repeat(201)
      const result = validateVendorName(longName)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateVendorEmail', () => {
    it('should accept undefined email', () => {
      const result = validateVendorEmail(undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept empty string', () => {
      const result = validateVendorEmail('')
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a valid email', () => {
      const result = validateVendorEmail('vendor@example.com')
      expect(result).toEqual(Success('vendor@example.com'))
    })

    it('should trim whitespace', () => {
      const result = validateVendorEmail('  vendor@example.com  ')
      expect(result).toEqual(Success('vendor@example.com'))
    })

    it('should reject invalid email format', () => {
      const result = validateVendorEmail('not-an-email')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect(result.error.message).toMatch(/Email must be a valid email address/)
      }
    })
  })

  describe('validateBillNumber', () => {
    it('should accept a valid bill number', () => {
      const result = validateBillNumber('BILL-2025-001')
      expect(result).toEqual(Success('BILL-2025-001'))
    })

    it('should trim whitespace', () => {
      const result = validateBillNumber('  BILL-001  ')
      expect(result).toEqual(Success('BILL-001'))
    })

    it('should reject empty bill number after trim', () => {
      const result = validateBillNumber('   ')
      expect(result.isSuccess).toBe(false)
    })

    it('should reject bill number longer than 50 characters', () => {
      const longNumber = 'A'.repeat(51)
      const result = validateBillNumber(longNumber)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateBillAmount', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validateBillAmount(123.45)
      expect(result).toEqual(Success(123.45))
    })

    it('should accept an integer amount', () => {
      const result = validateBillAmount(500)
      expect(result).toEqual(Success(500))
    })

    it('should reject zero', () => {
      const result = validateBillAmount(0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject negative amounts', () => {
      const result = validateBillAmount(-10.5)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject amounts with more than two decimal places', () => {
      const result = validateBillAmount(123.456)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject non-finite numbers', () => {
      const result = validateBillAmount(Infinity)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateLoanPrincipal', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validateLoanPrincipal(5000.0)
      expect(result).toEqual(Success(5000.0))
    })

    it('should reject zero', () => {
      const result = validateLoanPrincipal(0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject negative amounts', () => {
      const result = validateLoanPrincipal(-1000)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateInterestRate', () => {
    it('should accept undefined', () => {
      const result = validateInterestRate(undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a valid interest rate', () => {
      const result = validateInterestRate(5.5)
      expect(result).toEqual(Success(5.5))
    })

    it('should accept zero interest rate', () => {
      const result = validateInterestRate(0)
      expect(result).toEqual(Success(0))
    })

    it('should reject negative interest rate', () => {
      const result = validateInterestRate(-1.0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject interest rate with more than two decimal places', () => {
      const result = validateInterestRate(5.555)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject interest rate above 1000', () => {
      const result = validateInterestRate(1000.1)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateLoanTerm', () => {
    it('should accept undefined', () => {
      const result = validateLoanTerm(undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a positive integer', () => {
      const result = validateLoanTerm(36)
      expect(result).toEqual(Success(36))
    })

    it('should reject zero', () => {
      const result = validateLoanTerm(0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject negative term', () => {
      const result = validateLoanTerm(-12)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject non-integer term', () => {
      const result = validateLoanTerm(12.5)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject term longer than 1200 months', () => {
      const result = validateLoanTerm(1201)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentPrincipal', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validatePaymentPrincipal(100.0)
      expect(result).toEqual(Success(100.0))
    })

    it('should reject zero', () => {
      const result = validatePaymentPrincipal(0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject negative amounts', () => {
      const result = validatePaymentPrincipal(-50)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentInterest', () => {
    it('should accept a non-negative amount with two decimal places', () => {
      const result = validatePaymentInterest(25.5)
      expect(result).toEqual(Success(25.5))
    })

    it('should accept zero', () => {
      const result = validatePaymentInterest(0)
      expect(result).toEqual(Success(0))
    })

    it('should reject negative amounts', () => {
      const result = validatePaymentInterest(-10)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject amounts with more than two decimal places', () => {
      const result = validatePaymentInterest(25.555)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateExpenseAmount', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validateExpenseAmount(75.25)
      expect(result).toEqual(Success(75.25))
    })

    it('should reject zero', () => {
      const result = validateExpenseAmount(0)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateExpenseCategory', () => {
    it('should accept a valid category', () => {
      const result = validateExpenseCategory('Office Supplies')
      expect(result).toEqual(Success('Office Supplies'))
    })

    it('should trim whitespace', () => {
      const result = validateExpenseCategory('  Travel  ')
      expect(result).toEqual(Success('Travel'))
    })

    it('should reject empty category after trim', () => {
      const result = validateExpenseCategory('   ')
      expect(result.isSuccess).toBe(false)
    })

    it('should reject category longer than 100 characters', () => {
      const longCategory = 'A'.repeat(101)
      const result = validateExpenseCategory(longCategory)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateBillDateNotFuture', () => {
    it('should accept a past date', () => {
      const pastDate = new Date('2023-01-01')
      const result = validateBillDateNotFuture(pastDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should accept current date', () => {
      const now = new Date()
      const result = validateBillDateNotFuture(now)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject a future date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const result = validateBillDateNotFuture(futureDate)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toBe('Date cannot be in the future')
      }
    })

    it('should reject invalid date', () => {
      const invalidDate = new Date('invalid')
      const result = validateBillDateNotFuture(invalidDate)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentDateNotFuture', () => {
    it('should accept a past date', () => {
      const pastDate = new Date('2023-01-01')
      const result = validatePaymentDateNotFuture(pastDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject a future date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const result = validatePaymentDateNotFuture(futureDate)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateDueDate', () => {
    const billDate = new Date('2025-01-15')

    it('should accept undefined due date', () => {
      const result = validateDueDate(billDate, undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a due date equal to bill date', () => {
      const dueDate = new Date('2025-01-15')
      const result = validateDueDate(billDate, dueDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should accept a due date after bill date', () => {
      const dueDate = new Date('2025-01-20')
      const result = validateDueDate(billDate, dueDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject a due date before bill date', () => {
      const dueDate = new Date('2025-01-10')
      const result = validateDueDate(billDate, dueDate)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Due date must be on or after bill date/)
      }
    })

    it('should reject invalid due date', () => {
      const dueDate = new Date('invalid')
      const result = validateDueDate(billDate, dueDate)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentDoesNotExceedOpenAmount', () => {
    it('should accept payment amount equal to open amount', () => {
      const result = validatePaymentDoesNotExceedOpenAmount(100, 100)
      expect(result).toEqual(Success(100))
    })

    it('should accept payment amount less than open amount', () => {
      const result = validatePaymentDoesNotExceedOpenAmount(80, 100)
      expect(result).toEqual(Success(80))
    })

    it('should reject payment amount greater than open amount', () => {
      const result = validatePaymentDoesNotExceedOpenAmount(120, 100)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Payment amount.*exceeds open amount/)
      }
    })
  })

  describe('validateVendor', () => {
    it('should accept a valid vendor', () => {
      const vendorInput = {
        userId: 'user-123',
        name: 'Acme Supplies',
        email: 'contact@acme.example',
      }
      const result = validateVendor(vendorInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.name).toBe('Acme Supplies')
        expect(result.value.email).toBe('contact@acme.example')
        expect(result.value.balance).toBe(0)
      }
    })

    it('should reject invalid vendor name', () => {
      const vendorInput = {
        userId: 'user-123',
        name: '', // invalid
        email: 'contact@acme.example',
      }
      const result = validateVendor(vendorInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid email', () => {
      const vendorInput = {
        userId: 'user-123',
        name: 'Acme Supplies',
        email: 'invalid-email',
      }
      const result = validateVendor(vendorInput)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateVendorBill', () => {
    it('should accept a valid bill', () => {
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: 'BILL-001',
        amount: 1500.75,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.billNumber).toBe('BILL-001')
        expect(result.value.amount).toBe(1500.75)
        expect(result.value.status).toBe(VendorBillStatusConst.Draft)
        expect(result.value.journalEntryId).toBe('')
      }
    })

    it('should reject invalid bill number', () => {
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: '', // invalid
        amount: 1500.75,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid total', () => {
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: 'BILL-001',
        amount: -100, // invalid
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject future bill date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: 'BILL-001',
        amount: 100,
        date: futureDate,
        dueDate: undefined,
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject due date before bill date', () => {
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: 'BILL-001',
        amount: 100,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-01-10'), // before
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should accept bill without due date', () => {
      const billInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        billNumber: 'BILL-001',
        amount: 100,
        date: new Date('2025-01-15'),
        dueDate: undefined,
        description: 'Office furniture',
      }
      const result = validateVendorBill(billInput)
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('validateLoan', () => {
    it('should accept a valid loan', () => {
      const loanInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        principal: 10000,
        interestRate: 5.5,
        term: 36,
      }
      const result = validateLoan(loanInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.principal).toBe(10000)
        expect(result.value.interestRate).toBe(5.5)
        expect(result.value.term).toBe(36)
      }
    })

    it('should accept loan without optional fields', () => {
      const loanInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        principal: 5000,
      }
      const result = validateLoan(loanInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.interestRate).toBeUndefined()
        expect(result.value.term).toBeUndefined()
      }
    })

    it('should reject invalid principal', () => {
      const loanInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        principal: -1000,
        interestRate: 5.5,
        term: 36,
      }
      const result = validateLoan(loanInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid interest rate', () => {
      const loanInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        principal: 10000,
        interestRate: -1,
        term: 36,
      }
      const result = validateLoan(loanInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid term', () => {
      const loanInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        principal: 10000,
        interestRate: 5.5,
        term: -12,
      }
      const result = validateLoan(loanInput)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateLoanPayment', () => {
    it('should accept a valid loan payment', () => {
      const paymentInput = {
        loanId: 'loan-123',
        principalAmount: 500,
        interestAmount: 25.5,
        date: new Date('2025-01-15'),
        description: 'Monthly payment',
      }
      const result = validateLoanPayment(paymentInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.principalAmount).toBe(500)
        expect(result.value.interestAmount).toBe(25.5)
      }
    })

    it('should reject invalid principal amount', () => {
      const paymentInput = {
        loanId: 'loan-123',
        principalAmount: -100,
        interestAmount: 25.5,
        date: new Date('2025-01-15'),
        description: 'Monthly payment',
      }
      const result = validateLoanPayment(paymentInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid interest amount', () => {
      const paymentInput = {
        loanId: 'loan-123',
        principalAmount: 500,
        interestAmount: -10,
        date: new Date('2025-01-15'),
        description: 'Monthly payment',
      }
      const result = validateLoanPayment(paymentInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject future payment date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const paymentInput = {
        loanId: 'loan-123',
        principalAmount: 500,
        interestAmount: 25.5,
        date: futureDate,
        description: 'Monthly payment',
      }
      const result = validateLoanPayment(paymentInput)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateCashExpense', () => {
    it('should accept a valid cash expense', () => {
      const expenseInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        amount: 75.25,
        date: new Date('2025-01-15'),
        expenseCategory: 'Office Supplies',
        description: 'Printer paper',
      }
      const result = validateCashExpense(expenseInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.amount).toBe(75.25)
        expect(result.value.expenseCategory).toBe('Office Supplies')
      }
    })

    it('should reject invalid amount', () => {
      const expenseInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        amount: -10,
        date: new Date('2025-01-15'),
        expenseCategory: 'Office Supplies',
        description: 'Printer paper',
      }
      const result = validateCashExpense(expenseInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid category', () => {
      const expenseInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        amount: 75.25,
        date: new Date('2025-01-15'),
        expenseCategory: '', // invalid
        description: 'Printer paper',
      }
      const result = validateCashExpense(expenseInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject future date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const expenseInput = {
        userId: 'user-123',
        vendorId: 'vendor-456',
        amount: 75.25,
        date: futureDate,
        expenseCategory: 'Office Supplies',
        description: 'Printer paper',
      }
      const result = validateCashExpense(expenseInput)
      expect(result.isSuccess).toBe(false)
    })
  })
})