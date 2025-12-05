import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('Ledger Context: API Routes (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test to ensure isolation
  // Order matters due to foreign key constraints: delete dependent tables first
  beforeEach(async () => {
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
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

  // Helper to create a test user and return its ID
  const createTestUser = async (username: string = 'test_user_ledger') => {
    const user = await prisma.user.create({
      data: { username }
    })
    return user.id
  }

  // Helper to create a test account and return its ID
  const createTestAccount = async (userId: string, code: string = '101', name: string = 'Cash', type: AccountType = 'Asset', normalBalance: NormalBalance = 'Debit') => {
    const account = await prisma.account.create({
      data: {
        userId,
        code,
        name,
        type,
        normalBalance,
      }
    })
    return account.id
  }

  describe('POST /api/ledger/accounts', () => {
    it('should create an account with valid data', async () => {
      const userId = await createTestUser()
      const accountData = {
        userId,
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit'
      }

      const response = await request(app)
        .post('/api/ledger/accounts')
        .send(accountData)
        .expect(201)

      expect(response.body.account).toMatchObject({
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit',
        userId
      })
      expect(response.body.account.id).toBeDefined()
      expect(response.body.message).toBe('Account created successfully')

      // Verify in database
      const dbAccount = await prisma.account.findUnique({
        where: { id: response.body.account.id }
      })
      expect(dbAccount).not.toBeNull()
      expect(dbAccount?.code).toBe('101')
    })

    it('should reject duplicate account code for the same user', async () => {
      const userId = await createTestUser()
      // First account
      const first = {
        userId,
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit'
      }
      await request(app)
        .post('/api/ledger/accounts')
        .send(first)
        .expect(201)

      // Second account with same code
      const second = {
        userId,
        code: '101',
        name: 'Accounts Receivable',
        type: 'Asset',
        normalBalance: 'Debit'
      }
      const response = await request(app)
        .post('/api/ledger/accounts')
        .send(second)
        .expect(409)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('DuplicateAccountCode')
      expect(response.body.error.message).toMatch(/already exists/)
    })

    it('should allow duplicate account code for different users', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')

      const accountData = {
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit'
      }

      await request(app)
        .post('/api/ledger/accounts')
        .send({ ...accountData, userId: user1 })
        .expect(201)

      await request(app)
        .post('/api/ledger/accounts')
        .send({ ...accountData, userId: user2 })
        .expect(201)

      // Both should exist
      const accounts = await prisma.account.findMany({
        where: { code: '101' }
      })
      expect(accounts).toHaveLength(2)
    })

    it('should reject invalid account code (non-numeric)', async () => {
      const userId = await createTestUser()
      const invalid = {
        userId,
        code: 'abc',
        name: 'Invalid',
        type: 'Asset',
        normalBalance: 'Debit'
      }

      const response = await request(app)
        .post('/api/ledger/accounts')
        .send(invalid)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidAccountCode')
    })

    it('should reject missing required field', async () => {
      const userId = await createTestUser()
      const missingCode = {
        userId,
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit'
        // code omitted
      }

      const response = await request(app)
        .post('/api/ledger/accounts')
        .send(missingCode)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject invalid account type', async () => {
      const userId = await createTestUser()
      const invalidType = {
        userId,
        code: '101',
        name: 'Cash',
        type: 'InvalidType',
        normalBalance: 'Debit'
      }

      const response = await request(app)
        .post('/api/ledger/accounts')
        .send(invalidType)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/type is required/)
    })
  })

  describe('POST /api/ledger/journal-entries', () => {
    it('should post a balanced journal entry', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'Cash sale',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(entry)
        .expect(201)

      expect(response.body.journalEntry.description).toBe('Cash sale')
      expect(response.body.journalEntry.lines).toHaveLength(2)
      expect(response.body.journalEntry.userId).toBe(userId)
      expect(response.body.message).toBe('Journal entry posted successfully')

      // Verify in database
      const dbEntry = await prisma.journalEntry.findUnique({
        where: { id: response.body.journalEntry.id },
        include: { lines: true }
      })
      expect(dbEntry).not.toBeNull()
      expect(dbEntry?.lines).toHaveLength(2)
    })

    it('should reject unbalanced journal entry', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const unbalanced = {
        userId,
        description: 'Unbalanced',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 499, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(unbalanced)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('JournalEntryNotBalanced')
    })

    it('should reject journal entry with missing account', async () => {
      const userId = await createTestUser()
      const fakeAccountId = '550e8400-e29b-41d4-a716-446655440000' // random UUID

      const entry = {
        userId,
        description: 'Missing account',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: fakeAccountId, amount: 500, side: 'Debit' },
          { accountId: fakeAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(entry)
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('AccountNotFound')
    })

    it('should reject journal entry with insufficient lines (only one line)', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')

      const entry = {
        userId,
        description: 'Only one line',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(entry)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InsufficientLines')
    })

    it('should reject journal entry with invalid date', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'Invalid date',
        date: 'not-a-date',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(entry)
        .expect(400)

      // Domain validation catches invalid date and returns DomainFailure
      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidJournalEntryDate')
    })

    it('should accept an entry with multiple debit and credit lines', async () => {
      const userId = await createTestUser()
      const cashId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const arId = await createTestAccount(userId, '111', 'Accounts Receivable', 'Asset', 'Debit')
      const revenueId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')
      const liabilityId = await createTestAccount(userId, '201', 'Accounts Payable', 'Liability', 'Credit')

      const entry = {
        userId,
        description: 'Complex entry',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashId, amount: 300, side: 'Debit' },
          { accountId: arId, amount: 200, side: 'Debit' },
          { accountId: revenueId, amount: 400, side: 'Credit' },
          { accountId: liabilityId, amount: 100, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/ledger/journal-entries')
        .send(entry)
        .expect(201)

      expect(response.body.journalEntry.lines).toHaveLength(4)
      // Verify total debits = total credits (300+200 = 400+100)
      const debits = response.body.journalEntry.lines.filter((l: any) => l.side === 'Debit').reduce((sum: number, l: any) => sum + l.amount, 0)
      const credits = response.body.journalEntry.lines.filter((l: any) => l.side === 'Credit').reduce((sum: number, l: any) => sum + l.amount, 0)
      expect(debits).toBe(500)
      expect(credits).toBe(500)
    })
  })

  describe('GET /api/ledger/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/ledger/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('ledger')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})