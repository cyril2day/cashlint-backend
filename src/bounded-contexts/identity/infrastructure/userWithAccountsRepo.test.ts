import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createUserWithDefaultAccounts } from '@/bounded-contexts/identity/infrastructure/userWithAccountsRepo'
import { prisma } from '@/common/infrastructure/db'
import { DEFAULT_ACCOUNTS } from '@/bounded-contexts/ledger/domain/defaultAccounts'

describe('Identity Context: User with Default Accounts Repository (Infrastructure)', () => {

  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  // Delete in order of foreign key dependencies (reverse topological order)
  // Leaf tables first
  beforeEach(async () => {
    await prisma.period.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should create a user with default accounts in a transaction', async () => {
    // Count assertions:
    // 1. result.isSuccess
    // 2. user.username
    // 3. user.id defined
    // 4. dbUser not null
    // 5. dbUser.username
    // 6. accounts length
    // plus per account: 4 assertions (defined, name, type, normalBalance)
    const assertionsBeforeAccounts = 6
    expect.assertions(assertionsBeforeAccounts + DEFAULT_ACCOUNTS.length * 4)
    const username = 'newuser'

    const result = await createUserWithDefaultAccounts(username)

    expect(result.isSuccess).toBe(true)
    if (!result.isSuccess) return

    const user = result.value
    expect(user.username).toBe(username)
    expect(user.id).toBeDefined()

    // Verify user exists in DB
    const dbUser = await prisma.user.findUnique({ where: { username } })
    expect(dbUser).not.toBeNull()
    expect(dbUser?.username).toBe(username)

    // Verify default accounts are created for this user
    const accounts = await prisma.account.findMany({ where: { userId: user.id } })
    expect(accounts).toHaveLength(DEFAULT_ACCOUNTS.length)

    // Check each default account
    DEFAULT_ACCOUNTS.forEach(account => {
      const found = accounts.find(a => a.code === account.code)
      expect(found).toBeDefined()
      expect(found?.name).toBe(account.name)
      expect(found?.type).toBe(account.type)
      expect(found?.normalBalance).toBe(account.normalBalance)
    })
  })

  it('should fail and rollback when duplicate username', async () => {
    expect.assertions(5)
    const username = 'duplicateuser'

    // First creation succeeds
    const firstResult = await createUserWithDefaultAccounts(username)
    expect(firstResult.isSuccess).toBe(true)

    // Second creation fails
    const secondResult = await createUserWithDefaultAccounts(username)
    expect(secondResult.isSuccess).toBe(false)
    if (!secondResult.isSuccess) {
      expect(secondResult.error.message).toMatch(/already exists/)
    }

    // Ensure only one user exists (no partial creation)
    const users = await prisma.user.findMany({ where: { username } })
    expect(users).toHaveLength(1)

    // Ensure accounts count matches exactly one set of default accounts
    const user = users[0]
    const accounts = await prisma.account.findMany({ where: { userId: user.id } })
    expect(accounts).toHaveLength(DEFAULT_ACCOUNTS.length)
  })
})