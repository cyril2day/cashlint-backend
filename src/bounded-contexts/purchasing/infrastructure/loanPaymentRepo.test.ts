import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createLoanPayment, findLoanPaymentById, listLoanPaymentsByLoan } from './loanPaymentRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Loan Payment Repository (Infrastructure)', () => {
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

  const createTestLoan = async (userId: string, vendorId: string, principal: number = 10000) => {
    return await prisma.loan.create({
      data: {
        userId,
        vendorId,
        principal,
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

  it('should create a loan payment with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const paymentData = {
      loanId: loan.id,
      principalAmount: 500.0,
      interestAmount: 25.0,
      date: new Date('2025-01-15'),
      description: 'Monthly payment',
      journalEntryId: journalEntry.id,
    }

    const result = await createLoanPayment(paymentData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const payment = result.value
      expect(payment.loanId).toBe(loan.id)
      expect(payment.principalAmount).toBe(500.0)
      expect(payment.interestAmount).toBe(25.0)
      expect(payment.date).toEqual(new Date('2025-01-15'))
      expect(payment.description).toBe('Monthly payment')
      expect(payment.journalEntryId).toBe(journalEntry.id)
      expect(payment.id).toBeDefined()
      expect(payment.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbPayment = await prisma.loanPayment.findFirst({ where: { loanId: loan.id } })
    expect(dbPayment).not.toBeNull()
    expect(Number(dbPayment?.principalAmount)).toBe(500.0)
  })

  it('should find a loan payment by ID (with user isolation)', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan = await createTestLoan(user.id, vendor.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const paymentData = {
      loanId: loan.id,
      principalAmount: 300,
      interestAmount: 15,
      date: new Date(),
      description: 'Test payment',
      journalEntryId: journalEntry.id,
    }
    const createResult = await createLoanPayment(paymentData)
    expect(createResult.isSuccess).toBe(true)
    const createdPayment = createResult.isSuccess ? createResult.value : null
    expect(createdPayment).not.toBeNull()

    const findResult = await findLoanPaymentById(user.id, createdPayment!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdPayment!.id)
      expect(findResult.value?.principalAmount).toBe(300)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a loan payment belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const vendorA = await createTestVendor(userA.id)
    const loanA = await createTestLoan(userA.id, vendorA.id)
    const journalEntry = await createTestJournalEntry(userA.id)

    const paymentData = {
      loanId: loanA.id,
      principalAmount: 200,
      interestAmount: 10,
      date: new Date(),
      description: 'Payment A',
      journalEntryId: journalEntry.id,
    }
    const createResult = await createLoanPayment(paymentData)
    expect(createResult.isSuccess).toBe(true)
    const createdPayment = createResult.isSuccess ? createResult.value : null
    expect(createdPayment).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findLoanPaymentById(userB.id, createdPayment!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the payment belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list loan payments for a specific loan', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)
    const loan1 = await createTestLoan(user.id, vendor.id, 5000)
    const loan2 = await createTestLoan(user.id, vendor.id, 3000)
    const journalEntry1 = await createTestJournalEntry(user.id, 'JE1')
    const journalEntry2 = await createTestJournalEntry(user.id, 'JE2')
    const journalEntry3 = await createTestJournalEntry(user.id, 'JE3')

    const payments = [
      { loanId: loan1.id, principalAmount: 500, interestAmount: 20, date: new Date('2025-01-01'), description: 'Payment 1', journalEntryId: journalEntry1.id },
      { loanId: loan1.id, principalAmount: 500, interestAmount: 18, date: new Date('2025-02-01'), description: 'Payment 2', journalEntryId: journalEntry2.id },
      { loanId: loan2.id, principalAmount: 300, interestAmount: 12, date: new Date('2025-01-15'), description: 'Payment 3', journalEntryId: journalEntry3.id },
    ]
    for (const payment of payments) {
      const result = await createLoanPayment(payment)
      expect(result.isSuccess).toBe(true)
    }

    // List payments for loan1
    const listResult = await listLoanPaymentsByLoan(user.id, loan1.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const principalAmounts = listResult.value.map(p => p.principalAmount)
      expect(principalAmounts).toContain(500)
      expect(principalAmounts).toContain(500)
      // Should be ordered by date ascending
      expect(listResult.value[0].date.getTime()).toBeLessThanOrEqual(listResult.value[1].date.getTime())
    } else {
      expect.fail('Expected success but got failure')
    }

    // List payments for loan2
    const listResult2 = await listLoanPaymentsByLoan(user.id, loan2.id)
    expect(listResult2.isSuccess).toBe(true)
    if (listResult2.isSuccess) {
      expect(listResult2.value).toHaveLength(1)
      expect(listResult2.value[0].principalAmount).toBe(300)
    }
  })
})