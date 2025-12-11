import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { recordLoanPaymentWorkflow, RecordLoanPaymentCommand } from './recordLoanPaymentWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Record Loan Payment Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up before each test
  beforeEach(async () => {
    // Delete in correct order, respecting foreign keys
    // 1. Child tables of JournalEntry (that are not already in purchasing)
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    // 2. Purchasing child tables of JournalEntry
    await prisma.loanPayment.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.cashExpense.deleteMany()
    // 3. Other child tables
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    // 4. JournalLine (depends on JournalEntry and Account)
    await prisma.journalLine.deleteMany()
    // 5. JournalEntry (depends on User)
    await prisma.journalEntry.deleteMany()
    // 5.5 Period (depends on User)
    await prisma.period.deleteMany()
    // 6. Account (depends on User)
    await prisma.account.deleteMany()
    // 7. Session (depends on User)
    await prisma.session.deleteMany()
    // 8. User
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (username: string = 'test_user_purchasing') => {
    return await prisma.user.create({
      data: { username }
    })
  }

  const createTestVendor = async (userId: string, name: string = 'Test Vendor') => {
    return await prisma.vendor.create({
      data: {
        userId,
        name,
        balance: 0,
      }
    })
  }

  const createTestLoan = async (userId: string, vendorId: string, principal: number) => {
    return await prisma.loan.create({
      data: {
        userId,
        vendorId,
        principal,
        interestRate: 5.0,
        term: 12,
      }
    })
  }

  const createTestAccount = async (userId: string, code: string, name: string, type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', normalBalance: 'Debit' | 'Credit') => {
    return await prisma.account.create({
      data: {
        userId,
        code,
        name,
        type,
        normalBalance,
      }
    })
  }

  it('should record a loan payment with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 1000)
    // Create required accounts: Cash (101), Notes Payable (251), Interest Expense (505)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 200,
      interestAmount: 10,
      date: '2025-01-15',
      description: 'Monthly payment',
    }

    const result = await recordLoanPaymentWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const payment = result.value
      expect(payment.loanId).toBe(loan.id)
      expect(payment.principalAmount).toBe(200)
      expect(payment.interestAmount).toBe(10)
      expect(payment.date).toEqual(new Date('2025-01-15'))
      expect(payment.description).toBe('Monthly payment')
      expect(payment.journalEntryId).toBeDefined()
      expect(payment.id).toBeDefined()
      expect(payment.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbPayment = await prisma.loanPayment.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbPayment).not.toBeNull()
    expect(Number(dbPayment?.principalAmount)).toBe(200)

    // Verify journal entry created
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: result.isSuccess ? result.value.journalEntryId : '' },
      include: { lines: true }
    })
    expect(journalEntry).not.toBeNull()
    expect(journalEntry?.description).toContain('Monthly payment')
    expect(journalEntry?.lines).toHaveLength(3)

    // Verify loan principal updated
    const updatedLoan = await prisma.loan.findUnique({ where: { id: loan.id } })
    expect(updatedLoan).not.toBeNull()
    expect(Number(updatedLoan?.principal)).toBe(800) // 1000 - 200
  })

  it('should reject if vendor does not exist', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: 'non-existent-vendor-id',
      principalAmount: 200,
      interestAmount: 10,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('VendorNotFound')
    }
  })

  it('should reject if loan does not exist for vendor', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 200,
      interestAmount: 10,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('LoanNotFound')
    }
  })

  it('should reject if principal payment exceeds remaining loan principal', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 100) // only 100 principal
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 150, // more than 100
      interestAmount: 10,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PaymentExceedsLoanPrincipal')
    }
  })

  it('should reject negative principal amount', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 1000)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: -50,
      interestAmount: 10,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPaymentPrincipal')
    }
  })

  it('should reject negative interest amount', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 1000)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 200,
      interestAmount: -5,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPaymentInterest')
    }
  })

  it('should reject future payment date', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 1000)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const notesPayableAccount = await createTestAccount(user.id, '251', 'Notes Payable', 'Liability', 'Credit')
    const interestExpenseAccount = await createTestAccount(user.id, '505', 'Interest Expense', 'Expense', 'Debit')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 200,
      interestAmount: 10,
      date: tomorrow.toISOString().split('T')[0],
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PaymentDateInFuture')
    }
  })

  it('should reject if required accounts are missing', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id, 1000)
    // Do not create any accounts

    const command: RecordLoanPaymentCommand = {
      userId: user.id,
      vendorId: vendor.id,
      principalAmount: 200,
      interestAmount: 10,
      date: '2025-01-15',
    }

    const result = await recordLoanPaymentWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })
})