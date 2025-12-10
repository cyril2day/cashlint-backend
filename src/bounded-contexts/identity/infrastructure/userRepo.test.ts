import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createUser } from '@/bounded-contexts/identity/infrastructure/userRepo'
import { prisma } from '@/common/infrastructure/db'


describe('Identity Context: User Repository (Infrastructure)', () => {

  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  beforeEach(async () => {
    // Delete in order of foreign key dependencies (reverse topological order)
    // Leaf tables first
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should persist a valid user to the database', async () => {
    expect.assertions(5)
    const username = 'valid_user'
    
    const result = await createUser(username)

    expect(result.isSuccess).toBe(true)

    if (result.isSuccess) {
      expect(result.value.username).toBe(username)
      expect(result.value.id).toBeDefined()
    }

    const dbUser = await prisma.user.findUnique({ where: { username } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.username).toBe(username)
  })

  it('should fail when trying to create a duplicate username', async () => {
    expect.assertions(2)

    const username = 'duplicate_user'

    await createUser(username)

    const result = await createUser(username)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      // We expect a friendly error message, not the raw Prisma error
      expect(result.error.message).toMatch(/already exists/)
    }
  })
})