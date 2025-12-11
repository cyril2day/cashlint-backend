import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'

describe('PeriodClose Context: API Routes (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test to ensure isolation
  // Order matters due to foreign key constraints: delete dependent tables first
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

  // Helper to create a test user and return its ID
  const createTestUser = async (username: string = 'test_user_period') => {
    const user = await prisma.user.create({
      data: { username }
    })
    return user.id
  }

  // Helper to create a test account and return its ID
  const createTestAccount = async (userId: string, code: string = '101', name: string = 'Cash', type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense' = 'Asset', normalBalance: 'Debit' | 'Credit' = 'Debit') => {
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

  // Helper to create a period and return its ID
  const createTestPeriod = async (userId: string, name: string = 'January 2025', startDate: Date = new Date('2025-01-01T00:00:00Z'), endDate: Date = new Date('2025-01-31T23:59:59Z'), status: 'Open' | 'Closed' = 'Open') => {
    const period = await prisma.period.create({
      data: {
        userId,
        name,
        startDate,
        endDate,
        status,
      }
    })
    return period.id
  }

  describe('POST /api/period-close/periods', () => {
    it('should create a period with valid data', async () => {
      const userId = await createTestUser()
      const periodData = {
        userId,
        name: 'January 2025',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      }

      const response = await request(app)
        .post('/api/period-close/periods')
        .send(periodData)
        .expect(201)

      expect(response.body.period).toMatchObject({
        name: 'January 2025',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-01-31T23:59:59.000Z',
        status: 'Open',
        userId
      })
      expect(response.body.period.id).toBeDefined()
      expect(response.body.message).toBe('Period created successfully')

      // Verify in database
      const dbPeriod = await prisma.period.findUnique({
        where: { id: response.body.period.id }
      })
      expect(dbPeriod).not.toBeNull()
      expect(dbPeriod?.name).toBe('January 2025')
    })

    it('should reject duplicate period name for the same user', async () => {
      const userId = await createTestUser()
      // First period
      const first = {
        userId,
        name: 'January 2025',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      }
      await request(app)
        .post('/api/period-close/periods')
        .send(first)
        .expect(201)

      // Second period with same name
      const second = {
        userId,
        name: 'January 2025',
        startDate: '2025-02-01T00:00:00Z',
        endDate: '2025-02-28T23:59:59Z'
      }
      const response = await request(app)
        .post('/api/period-close/periods')
        .send(second)
        .expect(409)

      expect(response.body.error.type).toBe('InfrastructureFailure')
      expect(response.body.error.subtype).toBe('DuplicateKey')
      expect(response.body.error.message).toMatch(/Period with same name already exists/)
    })

    it('should allow duplicate period name for different users', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')

      const periodData = {
        name: 'January 2025',
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
      }

      await request(app)
        .post('/api/period-close/periods')
        .send({ ...periodData, userId: user1 })
        .expect(201)

      await request(app)
        .post('/api/period-close/periods')
        .send({ ...periodData, userId: user2 })
        .expect(201)

      // Both should exist
      const periods = await prisma.period.findMany({
        where: { name: 'January 2025' }
      })
      expect(periods).toHaveLength(2)
    })

    it('should reject invalid date range (startDate >= endDate)', async () => {
      const userId = await createTestUser()
      const invalid = {
        userId,
        name: 'Invalid Range',
        startDate: '2025-01-31T00:00:00Z',
        endDate: '2025-01-01T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/period-close/periods')
        .send(invalid)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidPeriodDateRange')
      expect(response.body.error.message).toMatch(/Start date must be before end date/)
    })

    it('should reject missing required field', async () => {
      const userId = await createTestUser()
      const missingName = {
        userId,
        startDate: '2025-01-01T00:00:00Z',
        endDate: '2025-01-31T23:59:59Z'
        // name omitted
      }

      const response = await request(app)
        .post('/api/period-close/periods')
        .send(missingName)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject invalid date format', async () => {
      const userId = await createTestUser()
      const invalidDate = {
        userId,
        name: 'Invalid Date',
        startDate: 'not-a-date',
        endDate: '2025-01-31T23:59:59Z'
      }

      const response = await request(app)
        .post('/api/period-close/periods')
        .send(invalidDate)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidPeriodDateRange')
    })
  })

  describe('GET /api/period-close/periods', () => {
    it('should list periods for a user', async () => {
      const userId = await createTestUser()
      // Create a few periods
      await createTestPeriod(userId, 'January 2025')
      await createTestPeriod(userId, 'February 2025', new Date('2025-02-01T00:00:00Z'), new Date('2025-02-28T23:59:59Z'))
      await createTestPeriod(userId, 'March 2025', new Date('2025-03-01T00:00:00Z'), new Date('2025-03-31T23:59:59Z'))

      const response = await request(app)
        .get('/api/period-close/periods')
        .query({ userId })
        .expect(200)

      expect(response.body.periods).toHaveLength(3)
      expect(response.body.count).toBe(3)
      const names = response.body.periods.map((p: any) => p.name)
      expect(names).toContain('January 2025')
      expect(names).toContain('February 2025')
      expect(names).toContain('March 2025')
    })

    it('should filter periods by status', async () => {
      const userId = await createTestUser()
      // Create one open and one closed period
      await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Open')
      await createTestPeriod(userId, 'December 2024', new Date('2024-12-01T00:00:00Z'), new Date('2024-12-31T23:59:59Z'), 'Closed')

      // Filter by open
      const openResponse = await request(app)
        .get('/api/period-close/periods')
        .query({ userId, status: 'Open' })
        .expect(200)

      expect(openResponse.body.periods).toHaveLength(1)
      expect(openResponse.body.periods[0].name).toBe('January 2025')

      // Filter by closed
      const closedResponse = await request(app)
        .get('/api/period-close/periods')
        .query({ userId, status: 'Closed' })
        .expect(200)

      expect(closedResponse.body.periods).toHaveLength(1)
      expect(closedResponse.body.periods[0].name).toBe('December 2024')
    })

    it('should reject missing userId', async () => {
      const response = await request(app)
        .get('/api/period-close/periods')
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/userId query parameter is required/)
    })
  })

  describe('POST /api/period-close/periods/:periodId/close', () => {
    it('should close an open period', async () => {
      const userId = await createTestUser()
      const periodId = await createTestPeriod(userId, 'January 2025')

      const response = await request(app)
        .post(`/api/period-close/periods/${periodId}/close`)
        .query({ userId })
        .expect(200)

      expect(response.body.period.status).toBe('Closed')
      expect(response.body.period.closedAt).toBeDefined()
      expect(response.body.message).toBe('Period closed successfully')

      // Verify in database
      const dbPeriod = await prisma.period.findUnique({
        where: { id: periodId }
      })
      expect(dbPeriod?.status).toBe('Closed')
      expect(dbPeriod?.closedAt).not.toBeNull()
    })

    it('should reject closing a period that is already closed', async () => {
      const userId = await createTestUser()
      const periodId = await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Closed')

      const response = await request(app)
        .post(`/api/period-close/periods/${periodId}/close`)
        .query({ userId })
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('PeriodAlreadyClosed')
      expect(response.body.error.message).toMatch(/Period January 2025 is already closed/)
    })

    it('should reject closing a period that does not exist', async () => {
      const userId = await createTestUser()
      const fakePeriodId = '550e8400-e29b-41d4-a716-446655440000'

      const response = await request(app)
        .post(`/api/period-close/periods/${fakePeriodId}/close`)
        .query({ userId })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('PeriodNotFound')
    })

    it('should reject missing userId', async () => {
      const userId = await createTestUser()
      const periodId = await createTestPeriod(userId)

      const response = await request(app)
        .post(`/api/period-close/periods/${periodId}/close`)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject periodId belonging to another user', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')
      const periodId = await createTestPeriod(user1)

      const response = await request(app)
        .post(`/api/period-close/periods/${periodId}/close`)
        .query({ userId: user2 })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('PeriodNotFound')
    })
  })

  describe('POST /api/period-close/manual-journal-entries', () => {
    it('should post a manual journal entry within an open period', async () => {
      const userId = await createTestUser()
      // Create an open period covering the entry date
      await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Open')
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'Manual adjusting entry',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/period-close/manual-journal-entries')
        .send(entry)
        .expect(201)

      expect(response.body.journalEntry.description).toBe('Manual adjusting entry')
      expect(response.body.journalEntry.lines).toHaveLength(2)
      expect(response.body.message).toBe('Manual journal entry posted successfully')
    })

    it('should reject manual journal entry when date is not within an open period', async () => {
      const userId = await createTestUser()
      // Create an open period, but the entry date is outside
      await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Open')
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'Outside period',
        date: '2025-02-15T00:00:00Z', // February, outside January
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/period-close/manual-journal-entries')
        .send(entry)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('PeriodNotOpen')
      expect(response.body.error.message).toMatch(/The date is not within any open period/)
    })

    it('should reject manual journal entry when all periods are closed', async () => {
      const userId = await createTestUser()
      // Create only a closed period
      await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Closed')
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'No open period',
        date: '2025-01-15T00:00:00Z', // Inside the closed period
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 500, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/period-close/manual-journal-entries')
        .send(entry)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('PeriodNotOpen')
    })

    it('should reject unbalanced manual journal entry', async () => {
      const userId = await createTestUser()
      await createTestPeriod(userId, 'January 2025', new Date('2025-01-01T00:00:00Z'), new Date('2025-01-31T23:59:59Z'), 'Open')
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const entry = {
        userId,
        description: 'Unbalanced',
        date: '2025-01-15T00:00:00Z',
        lines: [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: revenueAccountId, amount: 499, side: 'Credit' }
        ]
      }

      const response = await request(app)
        .post('/api/period-close/manual-journal-entries')
        .send(entry)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('JournalEntryNotBalanced')
    })

    it('should reject missing required fields', async () => {
      const userId = await createTestUser()
      const response = await request(app)
        .post('/api/period-close/manual-journal-entries')
        .send({})
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })
  })

  describe('GET /api/period-close/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/period-close/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('period-close')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})