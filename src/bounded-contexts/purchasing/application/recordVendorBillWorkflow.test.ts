import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { recordVendorBillWorkflow, RecordVendorBillCommand } from './recordVendorBillWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Record Vendor Bill Workflow (Integration)', () => {
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

  it('should record a vendor bill with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    // Create required accounts: Accounts Payable (201) and an Expense account (501)
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-001',
      amount: 500.75,
      date: '2025-01-15',
      dueDate: '2025-02-15',
      description: 'Office supplies',
    }

    const result = await recordVendorBillWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const bill = result.value
      expect(bill.userId).toBe(user.id)
      expect(bill.vendorId).toBe(vendor.id)
      expect(bill.billNumber).toBe('BILL-001')
      expect(bill.amount).toBe(500.75)
      expect(bill.status).toBe('Recorded')
      expect(bill.journalEntryId).toBeDefined()
      expect(bill.id).toBeDefined()
      expect(bill.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbBill = await prisma.vendorBill.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbBill).not.toBeNull()
    expect(dbBill?.billNumber).toBe('BILL-001')

    // Verify journal entry created
    const journalEntry = await prisma.journalEntry.findUnique({
      where: { id: result.isSuccess ? result.value.journalEntryId : '' },
      include: { lines: true }
    })
    expect(journalEntry).not.toBeNull()
    expect(journalEntry?.description).toContain('Office supplies')
    expect(journalEntry?.lines).toHaveLength(2)

    // Verify vendor balance updated
    const updatedVendor = await prisma.vendor.findUnique({ where: { id: vendor.id } })
    expect(updatedVendor).not.toBeNull()
    expect(Number(updatedVendor?.balance)).toBe(500.75)
  })

  it('should reject duplicate bill number', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-001',
      amount: 100,
      date: '2025-01-01',
    }

    const firstResult = await recordVendorBillWorkflow(command)
    expect(firstResult.isSuccess).toBe(true)

    const secondResult = await recordVendorBillWorkflow(command)
    expect(secondResult.isSuccess).toBe(false)
    if (!secondResult.isSuccess) {
      expect(secondResult.error.type).toBe('DomainFailure')
      expect(secondResult.error.subtype).toBe('DuplicateBillNumber')
    }
  })

  it('should reject invalid bill number (empty)', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: '', // invalid
      amount: 100,
      date: '2025-01-01',
    }

    const result = await recordVendorBillWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidBillNumber')
    }
  })

  it('should reject invalid amount (negative)', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-001',
      amount: -10,
      date: '2025-01-01',
    }

    const result = await recordVendorBillWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidBillTotal')
    }
  })

  it('should reject future bill date', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-001',
      amount: 100,
      date: tomorrow.toISOString().split('T')[0], // YYYY-MM-DD
    }

    const result = await recordVendorBillWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('BillDateInFuture')
    }
  })

  it('should reject if vendor does not exist', async () => {
    const user = await createTestUser()
    const apAccount = await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')
    const expenseAccount = await createTestAccount(user.id, '501', 'Salaries Expense', 'Expense', 'Debit')

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: 'non-existent-vendor-id',
      billNumber: 'BILL-001',
      amount: 100,
      date: '2025-01-01',
    }

    const result = await recordVendorBillWorkflow(command)
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

    const command: RecordVendorBillCommand = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-001',
      amount: 100,
      date: '2025-01-01',
    }

    const result = await recordVendorBillWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })
})