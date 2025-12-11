import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createVendorBill, findVendorBillById, findVendorBillByNumber, listVendorBills, updateVendorBillStatus } from './vendorBillRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Vendor Bill Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up before each test
  beforeEach(async () => {
    // Delete in correct order, respecting foreign keys
    // 0. Period (depends on User, but must be deleted before User due to foreign key)
    await prisma.period.deleteMany()
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

  const createTestUser = async (id: string = 'test-user-123', username: string = 'testuser123') => {
    return await prisma.user.create({
      data: { id, username }
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

  const createTestJournalEntry = async (userId: string, description: string = 'Test Journal Entry') => {
    return await prisma.journalEntry.create({
      data: {
        userId,
        description,
        date: new Date(),
      }
    })
  }

  it('should create a vendor bill with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const billData = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-2025-001',
      amount: 500.75,
      date: new Date('2025-01-15'),
      dueDate: new Date('2025-02-15'),
      description: 'Office supplies purchase',
      status: 'Draft' as const,
      journalEntryId: journalEntry.id,
    }

    const result = await createVendorBill(billData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const bill = result.value
      expect(bill.userId).toBe(user.id)
      expect(bill.vendorId).toBe(vendor.id)
      expect(bill.billNumber).toBe('BILL-2025-001')
      expect(bill.amount).toBe(500.75)
      expect(bill.status).toBe('Draft')
      expect(bill.journalEntryId).toBe(journalEntry.id)
      expect(bill.id).toBeDefined()
      expect(bill.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbBill = await prisma.vendorBill.findFirst({ where: { userId: user.id } })
    expect(dbBill).not.toBeNull()
    expect(dbBill?.billNumber).toBe('BILL-2025-001')
  })

  it('should find a vendor bill by ID', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const billData = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-2025-001',
      amount: 100,
      date: new Date(),
      status: 'Draft' as const,
      journalEntryId: journalEntry.id,
    }
    const createResult = await createVendorBill(billData)
    expect(createResult.isSuccess).toBe(true)
    const createdBill = createResult.isSuccess ? createResult.value : null
    expect(createdBill).not.toBeNull()

    const findResult = await findVendorBillById(user.id, createdBill!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdBill!.id)
      expect(findResult.value?.billNumber).toBe('BILL-2025-001')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a vendor bill belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const vendorA = await createTestVendor(userA.id, 'Vendor A')
    const journalEntry = await createTestJournalEntry(userA.id)

    const billData = {
      userId: userA.id,
      vendorId: vendorA.id,
      billNumber: 'BILL-2025-001',
      amount: 100,
      date: new Date(),
      status: 'Draft' as const,
      journalEntryId: journalEntry.id,
    }
    const createResult = await createVendorBill(billData)
    expect(createResult.isSuccess).toBe(true)
    const createdBill = createResult.isSuccess ? createResult.value : null
    expect(createdBill).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findVendorBillById(userB.id, createdBill!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the bill belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should find a vendor bill by bill number', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const billData = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-2025-001',
      amount: 100,
      date: new Date(),
      status: 'Draft' as const,
      journalEntryId: journalEntry.id,
    }
    const createResult = await createVendorBill(billData)
    expect(createResult.isSuccess).toBe(true)

    const findResult = await findVendorBillByNumber(user.id, 'BILL-2025-001')
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.billNumber).toBe('BILL-2025-001')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list vendor bills for a user', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry1 = await createTestJournalEntry(user.id, 'JE1')
    const journalEntry2 = await createTestJournalEntry(user.id, 'JE2')

    const bills = [
      { userId: user.id, vendorId: vendor.id, billNumber: 'BILL-001', amount: 100, date: new Date('2025-01-01'), status: 'Draft' as const, journalEntryId: journalEntry1.id },
      { userId: user.id, vendorId: vendor.id, billNumber: 'BILL-002', amount: 200, date: new Date('2025-01-02'), status: 'Recorded' as const, journalEntryId: journalEntry2.id },
    ]
    for (const bill of bills) {
      const result = await createVendorBill(bill)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listVendorBills(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const billNumbers = listResult.value.map(b => b.billNumber)
      expect(billNumbers).toContain('BILL-001')
      expect(billNumbers).toContain('BILL-002')
      // Should be ordered by date descending
      expect(listResult.value[0].date.getTime()).toBeGreaterThanOrEqual(listResult.value[1].date.getTime())
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should update vendor bill status', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const billData = {
      userId: user.id,
      vendorId: vendor.id,
      billNumber: 'BILL-2025-001',
      amount: 100,
      date: new Date(),
      status: 'Draft' as const,
      journalEntryId: journalEntry.id,
    }
    const createResult = await createVendorBill(billData)
    expect(createResult.isSuccess).toBe(true)
    const createdBill = createResult.isSuccess ? createResult.value : null
    expect(createdBill).not.toBeNull()

    const updateResult = await updateVendorBillStatus(user.id, createdBill!.id!, 'Recorded')
    expect(updateResult.isSuccess).toBe(true)
    if (updateResult.isSuccess) {
      expect(updateResult.value.status).toBe('Recorded')
    }

    // Verify in database
    const dbBill = await prisma.vendorBill.findUnique({ where: { id: createdBill!.id! } })
    expect(dbBill).not.toBeNull()
    expect(dbBill?.status).toBe('Recorded')
  })
})