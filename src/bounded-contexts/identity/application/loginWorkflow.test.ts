import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { loginWorkflow } from '@/bounded-contexts/identity/application/loginWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Identity Context: Login Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  // Must delete in correct order to respect foreign key constraints
  beforeEach(async () => {
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
    await prisma.period.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should successfully login with valid username', async () => {
    expect.assertions(9)

    const username = 'valid_user_123'
    // Create user first
    await prisma.user.create({
      data: {
        id: `user-${Date.now()}`,
        username,
      }
    })

    const result = await loginWorkflow(username)

    expect(result.isSuccess).toBe(true)

    if (result.isSuccess) {
      const { token, userId } = result.value // returns { token, userId }
      expect(token).toBeDefined()
      expect(typeof token).toBe('string')
      expect(userId).toBeDefined()
      expect(typeof userId).toBe('string')
      // Verify session is stored in DB
      const dbSession = await prisma.session.findUnique({ where: { id: token } })
      expect(dbSession).not.toBeNull()
      expect(dbSession!.userId).toBe(userId)
      expect(dbSession!.expiresAt).toBeInstanceOf(Date)
      expect(dbSession!.expiresAt.getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('should normalize uppercase username to lowercase', async () => {
    expect.assertions(3)

    const inputUsername = 'Valid_User_Upper'
    const expectedUsername = 'valid_user_upper'
    await prisma.user.create({
      data: {
        id: `user-${Date.now()}`,
        username: expectedUsername,
      }
    })

    const result = await loginWorkflow(inputUsername)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const { token } = result.value // returns { token, userId }
      expect(token).toBeDefined()
      // Verify session exists and belongs to the correct user
      const dbSession = await prisma.session.findUnique({ where: { id: token } })
      const user = await prisma.user.findUnique({ where: { username: expectedUsername } })
      expect(dbSession!.userId).toBe(user!.id)
    }
  })

  it('should reject usernames shorter than 3 characters', async () => {
    expect.assertions(2)

    const invalidUsername = 'ab'
    
    const result = await loginWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)

    if (!result.isSuccess) {
      expect(result.error.message).toMatch(/at least 3 characters/)
    }
  })

  it('should reject usernames with spaces', async () => {
    expect.assertions(2)

    const invalidUsername = 'space user'
    
    const result = await loginWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)

    if (!result.isSuccess) {
      expect(result.error.message).toMatch(/alphanumeric and underscores only/)
    }
  })

  it('should reject non-alphanumeric characters (symbols)', async () => {
    expect.assertions(1)

    const invalidUsername = 'user@name'
    
    const result = await loginWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)
  })

  it('should return UserNotFound when username does not exist', async () => {
    expect.assertions(2)

    const nonExistentUsername = 'nonexistent'
    
    const result = await loginWorkflow(nonExistentUsername)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.subtype).toBe('UserNotFound')
    }
  })
})