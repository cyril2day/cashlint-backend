import { describe, it, expect } from 'vitest'
import {
  validateCustomerName,
  validateCustomerEmail,
  validateInvoiceNumber,
  validateAmount,
  validateDateNotFuture,
  validateDueDate,
  validatePaymentMethod,
  validatePaymentReference,
  validatePaymentDoesNotExceedOpenAmount,
  validateCustomer,
  validateSalesInvoice,
  InvoiceStatus as InvoiceStatusConst,
} from './sales'
import { Success } from '@/common/types/result'

describe('Sales Domain Validation Functions', () => {
  describe('validateCustomerName', () => {
    it('should accept a valid customer name', () => {
      const result = validateCustomerName('John Doe')
      expect(result).toEqual(Success('John Doe'))
    })

    it('should trim whitespace', () => {
      const result = validateCustomerName('  Jane Smith  ')
      expect(result).toEqual(Success('Jane Smith'))
    })

    it('should reject empty name after trim', () => {
      const result = validateCustomerName('   ')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect(result.error.message).toMatch(/Customer name must be between 1 and 200 characters/)
      }
    })

    it('should reject names longer than 200 characters', () => {
      const longName = 'A'.repeat(201)
      const result = validateCustomerName(longName)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateCustomerEmail', () => {
    it('should accept undefined email', () => {
      const result = validateCustomerEmail(undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept empty string', () => {
      const result = validateCustomerEmail('')
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a valid email', () => {
      const result = validateCustomerEmail('john@example.com')
      expect(result).toEqual(Success('john@example.com'))
    })

    it('should trim whitespace', () => {
      const result = validateCustomerEmail('  jane@example.com  ')
      expect(result).toEqual(Success('jane@example.com'))
    })

    it('should reject invalid email format', () => {
      const result = validateCustomerEmail('not-an-email')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect(result.error.message).toMatch(/Email must be a valid email address/)
      }
    })
  })

  describe('validateInvoiceNumber', () => {
    it('should accept a valid invoice number', () => {
      const result = validateInvoiceNumber('INV-2025-001')
      expect(result).toEqual(Success('INV-2025-001'))
    })

    it('should trim whitespace', () => {
      const result = validateInvoiceNumber('  INV-001  ')
      expect(result).toEqual(Success('INV-001'))
    })

    it('should reject empty invoice number after trim', () => {
      const result = validateInvoiceNumber('   ')
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invoice number longer than 50 characters', () => {
      const longNumber = 'A'.repeat(51)
      const result = validateInvoiceNumber(longNumber)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateAmount', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validateAmount(123.45)
      expect(result).toEqual(Success(123.45))
    })

    it('should accept an integer amount', () => {
      const result = validateAmount(500)
      expect(result).toEqual(Success(500))
    })

    it('should reject zero', () => {
      const result = validateAmount(0)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject negative amounts', () => {
      const result = validateAmount(-10.5)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject amounts with more than two decimal places', () => {
      const result = validateAmount(123.456)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject non-finite numbers', () => {
      const result = validateAmount(Infinity)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateDateNotFuture', () => {
    it('should accept a past date', () => {
      const pastDate = new Date('2023-01-01')
      const result = validateDateNotFuture(pastDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should accept current date', () => {
      const now = new Date()
      const result = validateDateNotFuture(now)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject a future date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const result = validateDateNotFuture(futureDate)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Invoice date cannot be in the future/)
      }
    })

    it('should reject invalid date', () => {
      const invalidDate = new Date('invalid')
      const result = validateDateNotFuture(invalidDate)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateDueDate', () => {
    const invoiceDate = new Date('2025-01-15')

    it('should accept undefined due date', () => {
      const result = validateDueDate(invoiceDate, undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a due date equal to invoice date', () => {
      const dueDate = new Date('2025-01-15')
      const result = validateDueDate(invoiceDate, dueDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should accept a due date after invoice date', () => {
      const dueDate = new Date('2025-01-20')
      const result = validateDueDate(invoiceDate, dueDate)
      expect(result.isSuccess).toBe(true)
    })

    it('should reject a due date before invoice date', () => {
      const dueDate = new Date('2025-01-10')
      const result = validateDueDate(invoiceDate, dueDate)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Due date must be on or after invoice date/)
      }
    })

    it('should reject invalid due date', () => {
      const dueDate = new Date('invalid')
      const result = validateDueDate(invoiceDate, dueDate)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentMethod', () => {
    it('should accept Cash', () => {
      const result = validatePaymentMethod('Cash')
      expect(result).toEqual(Success('Cash'))
    })

    it('should accept Check', () => {
      const result = validatePaymentMethod('Check')
      expect(result).toEqual(Success('Check'))
    })

    it('should accept CreditCard', () => {
      const result = validatePaymentMethod('CreditCard')
      expect(result).toEqual(Success('CreditCard'))
    })

    it('should accept BankTransfer', () => {
      const result = validatePaymentMethod('BankTransfer')
      expect(result).toEqual(Success('BankTransfer'))
    })

    it('should reject unknown payment method', () => {
      const result = validatePaymentMethod('Bitcoin')
      expect(result.isSuccess).toBe(false)
    })

    it('should be case-sensitive (must match exactly)', () => {
      const result = validatePaymentMethod('cash') // lowercase
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validatePaymentReference', () => {
    it('should accept undefined reference', () => {
      const result = validatePaymentReference(undefined)
      expect(result).toEqual(Success(undefined))
    })

    it('should accept empty string', () => {
      const result = validatePaymentReference('')
      expect(result).toEqual(Success(undefined))
    })

    it('should accept a valid reference', () => {
      const result = validatePaymentReference('Check #1234')
      expect(result).toEqual(Success('Check #1234'))
    })

    it('should trim whitespace', () => {
      const result = validatePaymentReference('  REF-001  ')
      expect(result).toEqual(Success('REF-001'))
    })

    it('should reject reference longer than 100 characters', () => {
      const longRef = 'A'.repeat(101)
      const result = validatePaymentReference(longRef)
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

  describe('validateCustomer', () => {
    it('should accept a valid customer', () => {
      const customerInput = {
        userId: 'user-123',
        name: 'Acme Corp',
        email: 'contact@acme.example',
      }
      const result = validateCustomer(customerInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.name).toBe('Acme Corp')
        expect(result.value.email).toBe('contact@acme.example')
        expect(result.value.balance).toBe(0)
      }
    })

    it('should reject invalid customer name', () => {
      const customerInput = {
        userId: 'user-123',
        name: '', // invalid
        email: 'contact@acme.example',
      }
      const result = validateCustomer(customerInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid email', () => {
      const customerInput = {
        userId: 'user-123',
        name: 'Acme Corp',
        email: 'invalid-email',
      }
      const result = validateCustomer(customerInput)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateSalesInvoice', () => {
    it('should accept a valid invoice', () => {
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: 'INV-001',
        total: 1500.75,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.invoiceNumber).toBe('INV-001')
        expect(result.value.total).toBe(1500.75)
        expect(result.value.status).toBe(InvoiceStatusConst.Draft)
        expect(result.value.journalEntryId).toBe('')
      }
    })

    it('should reject invalid invoice number', () => {
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: '', // invalid
        total: 1500.75,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject invalid total', () => {
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: 'INV-001',
        total: -100, // invalid
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-02-15'),
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject future invoice date', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: 'INV-001',
        total: 100,
        date: futureDate,
        dueDate: undefined,
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject due date before invoice date', () => {
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: 'INV-001',
        total: 100,
        date: new Date('2025-01-15'),
        dueDate: new Date('2025-01-10'), // before
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(false)
    })

    it('should accept invoice without due date', () => {
      const invoiceInput = {
        userId: 'user-123',
        customerId: 'cust-456',
        invoiceNumber: 'INV-001',
        total: 100,
        date: new Date('2025-01-15'),
        dueDate: undefined,
        description: 'Web design services',
      }
      const result = validateSalesInvoice(invoiceInput)
      expect(result.isSuccess).toBe(true)
    })
  })
})