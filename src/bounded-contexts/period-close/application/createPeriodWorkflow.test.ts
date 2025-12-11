import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createPeriodWorkflow } from './createPeriodWorkflow'
import { prisma } from '@/common/infrastructure/db'
import type { CreatePeriodCommand } from './createPeriodWorkflow'

describe('PeriodClose Context: Create Period Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test to ensure isolation
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

  const createTestUser = async (username: string = 'test_user_period') => {
    return await prisma.user.create({
      data: { username }
    })
  }

  it('should create a period with valid data', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: 'January 2025',
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-31T23:59:59Z'
    }

    const result = await createPeriodWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.userId).toBe(user.id)
      expect(result.value.name).toBe('January 2025')
      expect(result.value.startDate).toEqual(new Date('2025-01-01T00:00:00Z'))
      expect(result.value.endDate).toEqual(new Date('2025-01-31T23:59:59Z'))
      expect(result.value.status).toBe('Open')
      expect(result.value.id).toBeDefined()
      expect(result.value.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbPeriod = await prisma.period.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' }
    })
    expect(dbPeriod).not.toBeNull()
    expect(dbPeriod?.name).toBe('January 2025')
    expect(dbPeriod?.status).toBe('Open')
  })

  it('should reject period with invalid name (empty)', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: '', // invalid
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-31T23:59:59Z'
    }

    const result = await createPeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPeriodName')
    }
  })

  it('should reject period with invalid name (too long)', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: 'A'.repeat(101), // 101 characters > 100 limit
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-31T23:59:59Z'
    }

    const result = await createPeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPeriodName')
    }
  })

  it('should reject period with start date after end date', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: 'Invalid Range',
      startDate: '2025-02-01T00:00:00Z',
      endDate: '2025-01-01T00:00:00Z' // start > end
    }

    const result = await createPeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPeriodDateRange')
    }
  })

  it('should reject period with invalid date format', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: 'Invalid Dates',
      startDate: 'not-a-date',
      endDate: '2025-01-01T00:00:00Z'
    }

    const result = await createPeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPeriodDateRange')
    }
  })

  it('should reject duplicate period name for same user', async () => {
    const user = await createTestUser()
    const command: CreatePeriodCommand = {
      userId: user.id,
      name: 'Duplicate',
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-01-31T23:59:59Z'
    }

    const firstResult = await createPeriodWorkflow(command)
    expect(firstResult.isSuccess).toBe(true)

    const secondResult = await createPeriodWorkflow(command)
    expect(secondResult.isSuccess).toBe(false)
    if (!secondResult.isSuccess) {
      // Should be infrastructure duplicate key error
      expect(secondResult.error.type).toBe('InfrastructureFailure')
      expect(secondResult.error.subtype).toBe('DuplicateKey')
    }
  })
})