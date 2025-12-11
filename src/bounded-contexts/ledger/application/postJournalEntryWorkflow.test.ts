import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { postJournalEntryWorkflow } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'
import { prisma } from '@/common/infrastructure/db'
import type { PostJournalEntryCommand } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('Ledger Context: Post Journal Entry Workflow (Integration)', () => {
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
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.period.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (username: string = 'test_user_journal') => {
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

  it('should post a balanced journal entry with valid data', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Cash sale',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.userId).toBe(user.id)
      expect(result.value.description).toBe('Cash sale')
      expect(result.value.lines).toHaveLength(2)
      expect(result.value.lines[0].amount).toBe(500)
      expect(result.value.lines[1].amount).toBe(500)
      expect(result.value.id).toBeDefined()
      expect(result.value.createdAt).toBeInstanceOf(Date)
    }

    // Verify in database
    const dbEntry = await prisma.journalEntry.findUnique({
      where: { id: result.isSuccess ? result.value.id : '' },
      include: { lines: true }
    })
    expect(dbEntry).not.toBeNull()
    expect(dbEntry?.lines).toHaveLength(2)
  })

  it('should reject unbalanced journal entry', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Unbalanced',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 499, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('JournalEntryNotBalanced')
    }
  })

  it('should reject journal entry with missing account', async () => {
    const user = await createTestUser()
    const fakeAccountId = '550e8400-e29b-41d4-a716-446655440000'

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Missing account',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: fakeAccountId, amount: 500, side: 'Debit' as const },
        { accountId: fakeAccountId, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })

  it('should reject journal entry with insufficient lines (only one line)', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'One line',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InsufficientLines')
    }
  })

  it('should reject journal entry with invalid date', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Invalid date',
      date: 'not-a-date',
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidJournalEntryDate')
    }
  })

  it('should reject journal entry with amount having more than two decimal places', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Invalid amount precision',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 500.123, side: 'Debit' as const }, // Invalid precision
        { accountId: revenueAccount.id, amount: 500.123, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidAmount')
      expect(result.error.message).toMatch(/at most two decimal places/)
    }
  })

  it('should accept an entry with multiple debit and credit lines', async () => {
    const user = await createTestUser()
    const cashId = (await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')).id
    const arId = (await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')).id
    const revenueId = (await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')).id
    const liabilityId = (await createTestAccount(user.id, '201', 'Accounts Payable', 'Liability', 'Credit')).id

    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: 'Complex entry',
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashId, amount: 300, side: 'Debit' as const },
        { accountId: arId, amount: 200, side: 'Debit' as const },
        { accountId: revenueId, amount: 400, side: 'Credit' as const },
        { accountId: liabilityId, amount: 100, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.lines).toHaveLength(4)
      const debits = result.value.lines.filter(l => l.side === 'Debit').reduce((sum, l) => sum + l.amount, 0)
      const credits = result.value.lines.filter(l => l.side === 'Credit').reduce((sum, l) => sum + l.amount, 0)
      expect(debits).toBe(500)
      expect(credits).toBe(500)
    }
  })

  it('should reject journal entry with description exceeding max length of 500 characters', async () => {
    const user = await createTestUser()
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const longDescription = 'a'.repeat(501) // 501 characters
    const command: PostJournalEntryCommand = {
      userId: user.id,
      description: longDescription,
      date: '2025-01-15T00:00:00Z',
      lines: [
        { accountId: cashAccount.id, amount: 100, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 100, side: 'Credit' as const }
      ]
    }

    const result = await postJournalEntryWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidJournalEntryDescription')
      expect(result.error.message).toMatch(/between 1 and 500 characters/)
    }
  })
})