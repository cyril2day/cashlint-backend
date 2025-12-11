import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { closePeriodWorkflow } from './closePeriodWorkflow'
import { createPeriodWorkflow } from './createPeriodWorkflow'
import { prisma } from '@/common/infrastructure/db'
import type { ClosePeriodCommand } from './closePeriodWorkflow'
import type { CreatePeriodCommand } from './createPeriodWorkflow'

describe('PeriodClose Context: Close Period Workflow (Integration)', () => {
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

  const createTestPeriod = async (userId: string, name: string, startDate: string, endDate: string) => {
    const command: CreatePeriodCommand = {
      userId,
      name,
      startDate,
      endDate
    }
    const result = await createPeriodWorkflow(command)
    if (!result.isSuccess) {
      throw new Error(`Failed to create test period: ${JSON.stringify(result.error)}`)
    }
    return result.value
  }

  it('should close an open period', async () => {
    const user = await createTestUser()
    const period = await createTestPeriod(
      user.id,
      'January 2025',
      '2025-01-01T00:00:00Z',
      '2025-01-31T23:59:59Z'
    )

    const command: ClosePeriodCommand = {
      userId: user.id,
      periodId: period.id!
    }

    const result = await closePeriodWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.status).toBe('Closed')
      expect(result.value.closedAt).toBeInstanceOf(Date)
      expect(result.value.id).toBe(period.id)
    }

    // Verify in database
    const dbPeriod = await prisma.period.findUnique({
      where: { id: period.id }
    })
    expect(dbPeriod?.status).toBe('Closed')
    expect(dbPeriod?.closedAt).not.toBeNull()
  })

  it('should reject closing a period that does not exist', async () => {
    const user = await createTestUser()
    const command: ClosePeriodCommand = {
      userId: user.id,
      periodId: '550e8400-e29b-41d4-a716-446655440000' // non-existent
    }

    const result = await closePeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PeriodNotFound')
    }
  })

  it('should reject closing a period that already closed', async () => {
    const user = await createTestUser()
    const period = await createTestPeriod(
      user.id,
      'January 2025',
      '2025-01-01T00:00:00Z',
      '2025-01-31T23:59:59Z'
    )

    // Close once
    const closeCommand: ClosePeriodCommand = {
      userId: user.id,
      periodId: period.id!
    }
    const firstClose = await closePeriodWorkflow(closeCommand)
    expect(firstClose.isSuccess).toBe(true)

    // Try to close again
    const secondClose = await closePeriodWorkflow(closeCommand)
    expect(secondClose.isSuccess).toBe(false)
    if (!secondClose.isSuccess) {
      expect(secondClose.error.type).toBe('DomainFailure')
      expect(secondClose.error.subtype).toBe('PeriodAlreadyClosed')
    }
  })

  it('should reject closing a period with invalid period ID (empty)', async () => {
    const user = await createTestUser()
    const command: ClosePeriodCommand = {
      userId: user.id,
      periodId: ''
    }

    const result = await closePeriodWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('ApplicationFailure')
      expect(result.error.subtype).toBe('InvalidCommand')
    }
  })

  // Note: In v1, there are no additional business rules for closing a period (like checking for future entries).
  // So we don't have extra validation beyond being open.
})