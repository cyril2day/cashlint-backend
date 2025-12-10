import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { recordCashExpenseWorkflow, RecordCashExpenseCommand } from './recordCashExpenseWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Record Cash Expense Workflow (Integration)', () => {
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

  it('should record a cash expense with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    // Create required accounts: Cash (101) and an Expense account (501)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 250.75,
      date: '2025-01-10',
      expenseCategory: 'Office Supplies',
      description: 'Purchased office supplies',
    }

    const result = await recordCashExpenseWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const expense = result.value
      expect(expense.userId).toBe(user.id)
      expect(expense.vendorId).toBe(vendor.id)
      expect(expense.amount).toBe(250.75)
      expect(expense.date).toEqual(new Date('2025-01-10'))
      expect(expense.expenseCategory).toBe('Office Supplies')
      expect(expense.description).toBe('Purchased office supplies')
      expect(expense.journalEntryId).toBeDefined()
      expect(expense.id).toBeDefined()
      expect(expense.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbExpense = await prisma.cashExpense.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbExpense).not.toBeNull()
    expect(dbExpense?.expenseCategory).toBe('Office Supplies')

    // Verify journal entry created
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: result.isSuccess ? result.value.journalEntryId : '' },
      include: { lines: true }
    })
    expect(journalEntry).not.toBeNull()
    expect(journalEntry?.description).toContain('Purchased office supplies')
    expect(journalEntry?.lines).toHaveLength(2)
  })

  it('should reject negative amount', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: vendor.id,
      amount: -100,
      date: '2025-01-10',
      expenseCategory: 'Office Supplies',
    }

    const result = await recordCashExpenseWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidExpenseAmount')
    }
  })

  it('should reject empty expense category', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 100,
      date: '2025-01-10',
      expenseCategory: '', // invalid
    }

    const result = await recordCashExpenseWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidExpenseCategory')
    }
  })

  it('should reject future expense date', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 100,
      date: tomorrow.toISOString().split('T')[0],
      expenseCategory: 'Office Supplies',
    }

    const result = await recordCashExpenseWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PaymentDateInFuture')
    }
  })

  it('should reject if vendor does not exist', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: 'non-existent-vendor-id',
      amount: 100,
      date: '2025-01-10',
      expenseCategory: 'Office Supplies',
    }

    const result = await recordCashExpenseWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('VendorNotFound')
    }
  })

  it('should reject if required accounts are missing', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    // Do not create any accounts

    const command: RecordCashExpenseCommand = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 100,
      date: '2025-01-10',
      expenseCategory: 'Office Supplies',
    }

    const result = await recordCashExpenseWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })
})