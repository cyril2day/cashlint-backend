import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createCustomerWorkflow } from '@/bounded-contexts/sales/application/createCustomerWorkflow'
import { prisma } from '@/common/infrastructure/db'
import type { CreateCustomerCommand } from '@/bounded-contexts/sales/application/createCustomerWorkflow'

describe('Sales Context: Create Customer Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test to ensure isolation
  beforeEach(async () => {
    // Delete child tables of JournalEntry and other parents
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.salesInvoice.deleteMany()
    // Delete parents of the above (except JournalEntry and Vendor and Loan)
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    // Now delete JournalEntry and its lines
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    // Delete Period (depends on User)
    await prisma.period.deleteMany()
    // Then delete Account, Session, User
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (username: string = 'test_user_sales') => {
    return await prisma.user.create({
      data: { username }
    })
  }

  it('should create a customer with valid data', async () => {
    const user = await createTestUser()
    const command: CreateCustomerCommand = {
      userId: user.id,
      name: 'Acme Corporation',
      email: 'contact@acme.example'
    }

    const result = await createCustomerWorkflow(command)

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
    const dbCustomer = await prisma.customer.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbCustomer).not.toBeNull()
    expect(dbCustomer?.name).toBe('Acme Corporation')
  })

  it('should create a customer without email', async () => {
    const user = await createTestUser()
    const command: CreateCustomerCommand = {
      userId: user.id,
      name: 'John Doe',
    }

    const result = await createCustomerWorkflow(command)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.email).toBeUndefined()
    }
  })

  it('should reject invalid customer name (empty)', async () => {
    const user = await createTestUser()
    const command: CreateCustomerCommand = {
      userId: user.id,
      name: '', // invalid
    }

    const result = await createCustomerWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCustomerName')
    }
  })

  it('should reject invalid email format', async () => {
    const user = await createTestUser()
    const command: CreateCustomerCommand = {
      userId: user.id,
      name: 'Test',
      email: 'invalid-email'
    }

    const result = await createCustomerWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCustomerEmail')
    }
  })

  // Note: we are not enforcing unique customer names per user in v1, so duplicates are allowed.
  it('should allow duplicate customer names for same user', async () => {
    const user = await createTestUser()
    const command: CreateCustomerCommand = {
      userId: user.id,
      name: 'Duplicate Name',
    }

    const firstResult = await createCustomerWorkflow(command)
    expect(firstResult.isSuccess).toBe(true)

    const secondResult = await createCustomerWorkflow(command)
    expect(secondResult.isSuccess).toBe(true)
  })
})