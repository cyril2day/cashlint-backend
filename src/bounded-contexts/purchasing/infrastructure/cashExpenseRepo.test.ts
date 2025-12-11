import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createCashExpense, findCashExpenseById, listCashExpenses } from './cashExpenseRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Cash Expense Repository (Infrastructure)', () => {
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

  it('should create a cash expense with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const expenseData = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 150.50,
      date: new Date('2025-01-10'),
      expenseCategory: 'Office Supplies',
      description: 'Bought printer paper',
      journalEntryId: journalEntry.id,
    }

    const result = await createCashExpense(expenseData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const expense = result.value
      expect(expense.userId).toBe(user.id)
      expect(expense.vendorId).toBe(vendor.id)
      expect(expense.amount).toBe(150.50)
      expect(expense.date).toEqual(new Date('2025-01-10'))
      expect(expense.expenseCategory).toBe('Office Supplies')
      expect(expense.description).toBe('Bought printer paper')
      expect(expense.journalEntryId).toBe(journalEntry.id)
      expect(expense.id).toBeDefined()
      expect(expense.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbExpense = await prisma.cashExpense.findFirst({ where: { userId: user.id } })
    expect(dbExpense).not.toBeNull()
    expect(Number(dbExpense?.amount)).toBe(150.50)
    expect(dbExpense?.expenseCategory).toBe('Office Supplies')
  })

  it('should create a cash expense without description', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const expenseData = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 75,
      date: new Date(),
      expenseCategory: 'Travel',
      journalEntryId: journalEntry.id,
    }

    const result = await createCashExpense(expenseData)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.description).toBeUndefined()
    }
  })

  it('should find a cash expense by ID', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const expenseData = {
      userId: user.id,
      vendorId: vendor.id,
      amount: 200,
      date: new Date(),
      expenseCategory: 'Meals',
      description: 'Team lunch',
      journalEntryId: journalEntry.id,
    }
    const createResult = await createCashExpense(expenseData)
    expect(createResult.isSuccess).toBe(true)
    const createdExpense = createResult.isSuccess ? createResult.value : null
    expect(createdExpense).not.toBeNull()

    const findResult = await findCashExpenseById(user.id, createdExpense!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdExpense!.id)
      expect(findResult.value?.amount).toBe(200)
      expect(findResult.value?.expenseCategory).toBe('Meals')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a cash expense belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const vendorA = await createTestVendor(userA.id)
    const journalEntry = await createTestJournalEntry(userA.id)

    const expenseData = {
      userId: userA.id,
      vendorId: vendorA.id,
      amount: 100,
      date: new Date(),
      expenseCategory: 'Misc',
      description: 'Expense A',
      journalEntryId: journalEntry.id,
    }
    const createResult = await createCashExpense(expenseData)
    expect(createResult.isSuccess).toBe(true)
    const createdExpense = createResult.isSuccess ? createResult.value : null
    expect(createdExpense).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findCashExpenseById(userB.id, createdExpense!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the expense belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list cash expenses for a user', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntry1 = await createTestJournalEntry(user.id, 'JE1')
    const journalEntry2 = await createTestJournalEntry(user.id, 'JE2')

    const expenses = [
      { userId: user.id, vendorId: vendor.id, amount: 50, date: new Date('2025-01-01'), expenseCategory: 'Category A', journalEntryId: journalEntry1.id },
      { userId: user.id, vendorId: vendor.id, amount: 120, date: new Date('2025-01-02'), expenseCategory: 'Category B', description: 'Expense with note', journalEntryId: journalEntry2.id },
    ]
    for (const expense of expenses) {
      const result = await createCashExpense(expense)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listCashExpenses(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const amounts = listResult.value.map(e => e.amount)
      expect(amounts).toContain(50)
      expect(amounts).toContain(120)
      // Should be ordered by date descending
      expect(listResult.value[0].date.getTime()).toBeGreaterThanOrEqual(listResult.value[1].date.getTime())
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should support pagination parameters', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const journalEntries = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createTestJournalEntry(user.id, `JE${i}`))
    )

    // Create 5 expenses
    for (let i = 0; i < 5; i++) {
      const expenseData = {
        userId: user.id,
        vendorId: vendor.id,
        amount: (i + 1) * 10,
        date: new Date(2025, 0, i + 1),
        expenseCategory: `Category ${i}`,
        journalEntryId: journalEntries[i].id,
      }
      await createCashExpense(expenseData)
    }

    // List with skip=2, take=2
    const listResult = await listCashExpenses(user.id, { skip: 2, take: 2 })
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      // Since ordering is date descending, the most recent dates are first.
      // Dates are 2025-01-05, 2025-01-04, 2025-01-03, 2025-01-02, 2025-01-01.
      // Skip 2 -> take 2025-01-03 and 2025-01-02.
      // We'll just verify we got two items.
      expect(listResult.value[0].amount).toBe(30) // 2025-01-03 -> amount 30
      expect(listResult.value[1].amount).toBe(20) // 2025-01-02 -> amount 20
    }
  })
})