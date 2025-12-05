import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createUserWorkflow } from '@/bounded-contexts/identity/application/createUserWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Identity Context: Create User Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  // Must delete in correct order to respect foreign key constraints
  beforeEach(async () => {
    await prisma.payment.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.salesInvoice.deleteMany()
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

  it('should successfully create a user with valid username', async () => {
    expect.assertions(5)

    const username = 'valid_user_123'
    
    const result = await createUserWorkflow(username)

    expect(result.isSuccess).toBe(true)

    if (result.isSuccess) {
      expect(result.value.username).toBe(username)
      expect(result.value.id).toBeDefined()
      expect(result.value.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbUser = await prisma.user.findUnique({ where: { username } })
    expect(dbUser).not.toBeNull()
  })

  it('should normalize uppercase username to lowercase', async () => {
    expect.assertions(2)

    const inputUsername = 'Valid_User_Upper'
    const expectedUsername = 'valid_user_upper'
    
    const result = await createUserWorkflow(inputUsername)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.username).toBe(expectedUsername)
    }
  })

  it('should reject usernames shorter than 3 characters', async () => {
    expect.assertions(2)

    const invalidUsername = 'ab'
    
    const result = await createUserWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)

    if (!result.isSuccess) {
      expect(result.error.message).toMatch(/at least 3 characters/)
    }
  })

  it('should reject usernames with spaces', async () => {
    expect.assertions(2)

    const invalidUsername = 'space user'
    
    const result = await createUserWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)

    if (!result.isSuccess) {
      expect(result.error.message).toMatch(/alphanumeric and underscores only/)
    }
  })

  it('should reject non-alphanumeric characters (symbols)', async () => {
    expect.assertions(1)

    const invalidUsername = 'user@name'
    
    const result = await createUserWorkflow(invalidUsername)

    expect(result.isSuccess).toBe(false)
  })

  it('should fail when trying to create a duplicate username', async () => {
    expect.assertions(2)

    const username = 'duplicate_user'

    // Create first user
    await createUserWorkflow(username)

    // Try to create duplicate
    const result = await createUserWorkflow(username)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.message).toMatch(/already exists/)
    }
  })
})