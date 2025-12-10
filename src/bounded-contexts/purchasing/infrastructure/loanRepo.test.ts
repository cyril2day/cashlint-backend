import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createLoan, findLoanById, listLoans, findLoanByVendorId, updateLoanPrincipal } from './loanRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Loan Repository (Infrastructure)', () => {
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

  it('should create a loan with valid data', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)

    const loanData = {
      userId: user.id,
      vendorId: vendor.id,
      principal: 10000.0,
      interestRate: 5.5,
      term: 36,
    }

    const result = await createLoan(loanData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const loan = result.value
      expect(loan.userId).toBe(user.id)
      expect(loan.vendorId).toBe(vendor.id)
      expect(loan.principal).toBe(10000.0)
      expect(loan.interestRate).toBe(5.5)
      expect(loan.term).toBe(36)
      expect(loan.id).toBeDefined()
      expect(loan.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbLoan = await prisma.loan.findFirst({ where: { userId: user.id } })
    expect(dbLoan).not.toBeNull()
    expect(Number(dbLoan?.principal)).toBe(10000.0)
  })

  it('should create a loan without optional fields', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)

    const loanData = {
      userId: user.id,
      vendorId: vendor.id,
      principal: 5000,
    }

    const result = await createLoan(loanData)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.interestRate).toBeUndefined()
      expect(result.value.term).toBeUndefined()
    }
  })

  it('should find a loan by ID', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)

    const loanData = {
      userId: user.id,
      vendorId: vendor.id,
      principal: 3000,
    }
    const createResult = await createLoan(loanData)
    expect(createResult.isSuccess).toBe(true)
    const createdLoan = createResult.isSuccess ? createResult.value : null
    expect(createdLoan).not.toBeNull()

    const findResult = await findLoanById(user.id, createdLoan!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdLoan!.id)
      expect(findResult.value?.principal).toBe(3000)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a loan belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const vendorA = await createTestVendor(userA.id)

    const loanData = {
      userId: userA.id,
      vendorId: vendorA.id,
      principal: 2000,
    }
    const createResult = await createLoan(loanData)
    expect(createResult.isSuccess).toBe(true)
    const createdLoan = createResult.isSuccess ? createResult.value : null
    expect(createdLoan).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findLoanById(userB.id, createdLoan!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the loan belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list loans for a user', async () => {
    const user = await createTestUser()
    const vendor1 = await createTestVendor(user.id, 'Vendor One')
    const vendor2 = await createTestVendor(user.id, 'Vendor Two')

    const loans = [
      { userId: user.id, vendorId: vendor1.id, principal: 1000 },
      { userId: user.id, vendorId: vendor2.id, principal: 2000, interestRate: 3.0, term: 12 },
    ]
    for (const loan of loans) {
      const result = await createLoan(loan)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listLoans(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const principals = listResult.value.map(l => l.principal)
      expect(principals).toContain(1000)
      expect(principals).toContain(2000)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should find a loan by vendor ID', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)

    const loanData = {
      userId: user.id,
      vendorId: vendor.id,
      principal: 1500,
    }
    const createResult = await createLoan(loanData)
    expect(createResult.isSuccess).toBe(true)

    const findResult = await findLoanByVendorId(user.id, vendor.id)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.vendorId).toBe(vendor.id)
      expect(findResult.value?.principal).toBe(1500)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should update loan principal', async () => {
    const user = await createTestUser()
    const vendor = await createTestVendor(user.id)

    const loanData = {
      userId: user.id,
      vendorId: vendor.id,
      principal: 5000,
    }
    const createResult = await createLoan(loanData)
    expect(createResult.isSuccess).toBe(true)
    const createdLoan = createResult.isSuccess ? createResult.value : null
    expect(createdLoan).not.toBeNull()

    // Update principal to 4500 (reduce by 500)
    const updateResult = await updateLoanPrincipal(user.id, createdLoan!.id!, 4500)
    expect(updateResult.isSuccess).toBe(true)
    if (updateResult.isSuccess) {
      expect(updateResult.value.principal).toBe(4500)
    }

    // Verify in database
    const dbLoan = await prisma.loan.findUnique({ where: { id: createdLoan!.id! } })
    expect(dbLoan).not.toBeNull()
    expect(Number(dbLoan!.principal)).toBe(4500)
  })
})