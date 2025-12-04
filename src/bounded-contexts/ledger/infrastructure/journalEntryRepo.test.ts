import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createJournalEntry, findJournalEntryById, listJournalEntries } from './journalEntryRepo'
import { prisma } from '@/common/infrastructure/db'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('Ledger Context: Journal Entry Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up before each test
  beforeEach(async () => {
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests
  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (id: string, username: string) => {
    return await prisma.user.create({
      data: { id, username }
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
        normalBalance: normalBalance as NormalBalance,
      }
    })
  }

  it('should persist a valid journal entry with lines', async () => {
    const user = await createTestUser('user-123', 'testuser')
    const cashAccount = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const entryData = {
      userId: user.id,
      description: 'Cash sale',
      date: new Date('2025-01-15'),
      lines: [
        { accountId: cashAccount.id, amount: 500, side: 'Debit' as const },
        { accountId: revenueAccount.id, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await createJournalEntry(entryData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const entry = result.value
      expect(entry.userId).toBe(user.id)
      expect(entry.description).toBe('Cash sale')
      expect(entry.lines).toHaveLength(2)
      expect(entry.lines[0].amount).toBe(500)
      expect(entry.lines[0].side).toBe('Debit')
      expect(entry.lines[1].amount).toBe(500)
      expect(entry.lines[1].side).toBe('Credit')
      expect(entry.id).toBeDefined()
      expect(entry.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbEntry = await prisma.journalEntry.findFirst({
      where: { userId: user.id },
      include: { lines: true }
    })
    expect(dbEntry).not.toBeNull()
    expect(dbEntry?.lines).toHaveLength(2)
  })

  it('should find a journal entry by ID for the same user', async () => {
    const user = await createTestUser('user-456', 'testuser2')
    const account1 = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const account2 = await createTestAccount(user.id, '401', 'Revenue', 'Revenue', 'Credit')

    const entryData = {
      userId: user.id,
      description: 'Test entry',
      date: new Date('2025-01-15'),
      lines: [
        { accountId: account1.id, amount: 300, side: 'Debit' as const },
        { accountId: account2.id, amount: 300, side: 'Credit' as const }
      ]
    }

    const createResult = await createJournalEntry(entryData)
    expect(createResult.isSuccess).toBe(true)
    const createdEntry = createResult.isSuccess ? createResult.value : null
    expect(createdEntry).not.toBeNull()

    const findResult = await findJournalEntryById(user.id, createdEntry!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value).not.toBeNull()
      expect(findResult.value?.id).toBe(createdEntry!.id)
      expect(findResult.value?.description).toBe('Test entry')
      expect(findResult.value?.lines).toHaveLength(2)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a journal entry belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const accountA = await createTestAccount(userA.id, '101', 'Cash', 'Asset', 'Debit')
    const accountB = await createTestAccount(userA.id, '401', 'Revenue', 'Revenue', 'Credit')

    const entryData = {
      userId: userA.id,
      description: 'Entry for user A',
      date: new Date('2025-01-15'),
      lines: [
        { accountId: accountA.id, amount: 100, side: 'Debit' as const },
        { accountId: accountB.id, amount: 100, side: 'Credit' as const }
      ]
    }

    const createResult = await createJournalEntry(entryData)
    expect(createResult.isSuccess).toBe(true)
    const createdEntry = createResult.isSuccess ? createResult.value : null
    expect(createdEntry).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findJournalEntryById(userB.id, createdEntry!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the entry belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list journal entries for a user in descending date order', async () => {
    const user = await createTestUser('user-list', 'listuser')
    const account1 = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const account2 = await createTestAccount(user.id, '401', 'Revenue', 'Revenue', 'Credit')

    // Create three entries with different dates
    const entries = [
      {
        userId: user.id,
        description: 'Entry 1',
        date: new Date('2025-01-10'),
        lines: [
          { accountId: account1.id, amount: 100, side: 'Debit' as const },
          { accountId: account2.id, amount: 100, side: 'Credit' as const }
        ]
      },
      {
        userId: user.id,
        description: 'Entry 2',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: account1.id, amount: 200, side: 'Debit' as const },
          { accountId: account2.id, amount: 200, side: 'Credit' as const }
        ]
      },
      {
        userId: user.id,
        description: 'Entry 3',
        date: new Date('2025-01-12'),
        lines: [
          { accountId: account1.id, amount: 300, side: 'Debit' as const },
          { accountId: account2.id, amount: 300, side: 'Credit' as const }
        ]
      }
    ]

    for (const entry of entries) {
      const result = await createJournalEntry(entry)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listJournalEntries(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      // Should be ordered by date descending (most recent first)
      expect(listResult.value).toHaveLength(3)
      const dates = listResult.value.map(e => e.date.getTime())
      // Check descending order
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1])
      expect(dates[1]).toBeGreaterThanOrEqual(dates[2])
      // Verify the order: 2025-01-15, 2025-01-12, 2025-01-10
      expect(listResult.value[0].description).toBe('Entry 2')
      expect(listResult.value[1].description).toBe('Entry 3')
      expect(listResult.value[2].description).toBe('Entry 1')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list journal entries with pagination', async () => {
    const user = await createTestUser('user-paginate', 'paginateuser')
    const account1 = await createTestAccount(user.id, '101', 'Cash', 'Asset', 'Debit')
    const account2 = await createTestAccount(user.id, '401', 'Revenue', 'Revenue', 'Credit')

    // Create 5 entries
    for (let i = 1; i <= 5; i++) {
      const entryData = {
        userId: user.id,
        description: `Entry ${i}`,
        date: new Date(`2025-01-${10 + i}`),
        lines: [
          { accountId: account1.id, amount: i * 100, side: 'Debit' as const },
          { accountId: account2.id, amount: i * 100, side: 'Credit' as const }
        ]
      }
      const result = await createJournalEntry(entryData)
      expect(result.isSuccess).toBe(true)
    }

    // List with skip=1, take=2
    const listResult = await listJournalEntries(user.id, { skip: 1, take: 2 })
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      // Should be the 2nd and 3rd most recent (since descending)
      // Dates: 2025-01-15 (Entry5), 2025-01-14 (Entry4), 2025-01-13 (Entry3), ...
      // Skip 1 -> skip Entry5, take 2 -> Entry4 and Entry3
      expect(listResult.value[0].description).toBe('Entry 4')
      expect(listResult.value[1].description).toBe('Entry 3')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should handle foreign key constraint error when account does not exist', async () => {
    const user = await createTestUser('user-fk', 'fkuser')
    const fakeAccountId = '550e8400-e29b-41d4-a716-446655440000'

    const entryData = {
      userId: user.id,
      description: 'Invalid account',
      date: new Date('2025-01-15'),
      lines: [
        { accountId: fakeAccountId, amount: 500, side: 'Debit' as const },
        { accountId: fakeAccountId, amount: 500, side: 'Credit' as const }
      ]
    }

    const result = await createJournalEntry(entryData)

    // Should fail with an infrastructure error
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('InfrastructureFailure')
      expect(result.error.subtype).toBe('AccountRepositoryError')
    }
  })
})