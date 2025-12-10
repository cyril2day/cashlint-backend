import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createVendorWorkflow, CreateVendorCommand } from './createVendorWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Create Vendor Workflow (Integration)', () => {
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

  it('should create a vendor with valid data', async () => {
    const user = await createTestUser()
    const command: CreateVendorCommand = {
      userId: user.id,
      name: 'Acme Corporation',
      email: 'contact@acme.example'
    }

    const result = await createVendorWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.userId).toBe(user.id)
      expect(result.value.name).toBe('Acme Corporation')
      expect(result.value.email).toBe('contact@acme.example')
      expect(result.value.balance).toBe(0)
      expect(result.value.id).toBeDefined()
      expect(result.value.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbVendor = await prisma.vendor.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbVendor).not.toBeNull()
    expect(dbVendor?.name).toBe('Acme Corporation')
  })

  it('should create a vendor without email', async () => {
    const user = await createTestUser()
    const command: CreateVendorCommand = {
      userId: user.id,
      name: 'John Doe',
    }

    const result = await createVendorWorkflow(command)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.email).toBeUndefined()
    }
  })

  it('should reject invalid vendor name (empty)', async () => {
    const user = await createTestUser()
    const command: CreateVendorCommand = {
      userId: user.id,
      name: '', // invalid
    }

    const result = await createVendorWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidVendorName')
    }
  })

  it('should reject invalid email format', async () => {
    const user = await createTestUser()
    const command: CreateVendorCommand = {
      userId: user.id,
      name: 'Test',
      email: 'invalid-email'
    }

    const result = await createVendorWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidVendorEmail')
    }
  })

  // Note: we are not enforcing unique vendor names per user in v1, so duplicates are allowed.
  it('should allow duplicate vendor names for same user', async () => {
    const user = await createTestUser()
    const command: CreateVendorCommand = {
      userId: user.id,
      name: 'Duplicate Name',
    }

    const firstResult = await createVendorWorkflow(command)
    expect(firstResult.isSuccess).toBe(true)

    const secondResult = await createVendorWorkflow(command)
    expect(secondResult.isSuccess).toBe(true)
  })
})