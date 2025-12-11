import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { postManualJournalEntryWorkflow } from './postManualJournalEntryWorkflow'
import { createPeriodWorkflow } from './createPeriodWorkflow'
import { prisma } from '@/common/infrastructure/db'
import type { PostManualJournalEntryCommand } from './postManualJournalEntryWorkflow'
import type { CreatePeriodCommand } from './createPeriodWorkflow'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('PeriodClose Context: Post Manual Journal Entry Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test to ensure isolation
  beforeEach(async () => {
    await prisma.payment.deleteMany()
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.period.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (username: string = 'test_user_manual') => {
    return await prisma.user.create({
      data: { username }
    })
  }

  const createTestAccount = async (
    userId: string,
    code: string,
    name: string,
    type: string,
    normalBalance: string
  ) => {
    return await prisma.account.create({
      data: {
        userId,
        code,
        name,
        type: type as AccountType,
        normalBalance: normalBalance as NormalBalance
      }
    })
  }

  const createOpenPeriod = async (userId: string, name: string, startDate: Date, endDate: Date) => {
    const command: CreatePeriodCommand = {
      userId,
      name,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    }
    const result = await createPeriodWorkflow(command)
    if (!result.isSuccess) throw new Error('Failed to create period for test')
    return result.value
  }

  it('should post a manual journal entry within an open period', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    const period = await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Adjusting entry for accrued revenue',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 750, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 750, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.userId).toBe(user.id)
      expect(result.value.description).toBe('Adjusting entry for accrued revenue')
      expect(result.value.date).toEqual(new Date('2025-01-15T00:00:00Z'))
      expect(result.value.lines).toHaveLength(2)
      expect(result.value.lines[0].amount).toBe(750)
      expect(result.value.lines[1].amount).toBe(750)
      expect(result.value.id).toBeDefined()
      expect(result.value.createdAt).toBeInstanceOf(Date)
    }
  })

  it('should reject manual journal entry with missing description', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: '', // empty description
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 750, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 750, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCommand')
      expect(result.error.message).toMatch(/Description is required/)
    }
  })

  it('should reject manual journal entry with missing date', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Valid description',
      date: '', // empty date
      lines: [
        { accountId: cashAccount.id, amount: 750, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 750, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCommand')
      expect(result.error.message).toMatch(/Date is required/)
    }
  })

  it('should reject manual journal entry with no lines', async () => {
    const user = await createTestUser()
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Valid description',
      date: '2025-01-15T00:00:00Z',
      lines: [] // empty lines
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCommand')
      expect(result.error.message).toMatch(/At least one journal line is required/)
    }
  })

  it('should reject manual journal entry with invalid date format', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Valid description',
      date: 'not-a-date', // invalid date
      lines: [
        { accountId: cashAccount.id, amount: 750, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 750, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidCommand')
      expect(result.error.message).toMatch(/Invalid date format/)
    }
  })

  it('should reject manual journal entry when date is not within any open period', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    // Create a period for February 2025, but the journal entry date is in March
    await createOpenPeriod(
      user.id,
      'February 2025',
      new Date('2025-02-01T00:00:00Z'),
      new Date('2025-02-28T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Adjusting entry',
      date: '2025-03-15T00:00:00Z', // Outside the open period
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PeriodNotOpen')
      expect(result.error.message).toMatch(/The date is not within any open period/)
    }
  })

  it('should reject manual journal entry when no open period exists', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    // Do not create any period

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Adjusting entry',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PeriodNotOpen')
      expect(result.error.message).toMatch(/The date is not within any open period/)
    }
  })

  it('should propagate ledger workflow errors (e.g., unbalanced lines)', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Unbalanced entry',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 499, side: 'Credit' as const } // Unbalanced
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('JournalEntryNotBalanced')
    }
  })

  it('should reject manual journal entry when account does not exist', async () => {
    const user = await createTestUser()
    const fakeAccountId = '550e8400-e29b-41d4-a716-446655440000'
    await createOpenPeriod(
      user.id,
      'January 2025',
      new Date('2025-01-01T00:00:00Z'),
      new Date('2025-01-31T23:59:59Z')
    )

    const command: PostManualJournalEntryCommand = {
      userId: user.id,
      description: 'Missing account',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: fakeAccountId, amount: 500, side: 'Debit' as const },
        { accountId: fakeAccountId, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postManualJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })
})