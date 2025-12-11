import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'

describe('Reporting Context: API Routes (Integration)', () => {
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
  const createTestUser = async (username: string = 'test_user_reporting') => {
    const user = await prisma.user.create({
      data: { username }
    })
    return user.id
  }

  // Helper to create a test account and return its ID
  const createTestAccount = async (
    userId: string,
    code: string,
    name: string,
    type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
    normalBalance: 'Debit' | 'Credit'
  ) => {
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

  // Helper to create a journal entry
  const createJournalEntry = async (
    userId: string,
    description: string,
    date: Date,
    lines: Array<{
      accountId: string
      amount: number
      side: 'Debit' | 'Credit'
    }>
  ) => {
    const entry = await prisma.journalEntry.create({
      data: {
        userId,
        description,
        date,
        lines: {
          create: lines.map(line => ({
            accountId: line.accountId,
            amount: line.amount,
            side: line.side,
          }))
        }
      }
    })
    return entry
  }

  describe('GET /api/reporting/income-statement', () => {
    it('should generate income statement for a period', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')
      const expenseAccountId = await createTestAccount(userId, '501', 'Rent Expense', 'Expense', 'Debit')

      // Journal entry 1: 2025-06-01, Sale: debit Cash 1000, credit Revenue 1000
      await createJournalEntry(
        userId,
        'Sale',
        new Date('2025-06-01'),
        [
          { accountId: cashAccountId, amount: 1000, side: 'Debit' },
          { accountId: revenueAccountId, amount: 1000, side: 'Credit' }
        ]
      )

      // Journal entry 2: 2025-07-15, Pay rent: debit Expense 300, credit Cash 300
      await createJournalEntry(
        userId,
        'Pay rent',
        new Date('2025-07-15'),
        [
          { accountId: expenseAccountId, amount: 300, side: 'Debit' },
          { accountId: cashAccountId, amount: 300, side: 'Credit' }
        ]
      )

      const response = await request(app)
        .get('/api/reporting/income-statement')
        .query({
          userId,
          startDate: '2025-07-01T00:00:00Z',
          endDate: '2025-07-31T23:59:59Z'
        })
        .expect(200)

      const stmt = response.body.incomeStatement
      expect(stmt.period.startDate).toBe('2025-07-01T00:00:00.000Z')
      expect(stmt.period.endDate).toBe('2025-07-31T23:59:59.000Z')
      // Only rent expense in July, revenue 0
      expect(stmt.revenueTotal).toBe(0)
      expect(stmt.expenseTotal).toBe(300)
      expect(stmt.netIncome).toBe(-300)
      expect(stmt.revenues).toHaveLength(0)
      expect(stmt.expenses).toHaveLength(1)
      expect(stmt.expenses[0].accountCode).toBe('501')
      expect(stmt.expenses[0].amount).toBe(300)
    })

    it('should reject missing userId', async () => {
      const response = await request(app)
        .get('/api/reporting/income-statement')
        .query({
          startDate: '2025-01-01',
          endDate: '2025-12-31'
        })
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject invalid date range (start > end)', async () => {
      const userId = await createTestUser()
      const response = await request(app)
        .get('/api/reporting/income-statement')
        .query({
          userId,
          startDate: '2025-12-31',
          endDate: '2025-01-01'
        })
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidDateRange')
    })
  })

  describe('GET /api/reporting/balance-sheet', () => {
    it('should generate balance sheet as of a date', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')
      const expenseAccountId = await createTestAccount(userId, '501', 'Rent Expense', 'Expense', 'Debit')
      const capitalAccountId = await createTestAccount(userId, '301', 'Owner Capital', 'Equity', 'Credit')
      const drawingAccountId = await createTestAccount(userId, '302', 'Owner Drawing', 'Equity', 'Debit')

      // Journal entries as in the workflow test
      await createJournalEntry(
        userId,
        'Sale',
        new Date('2025-06-01'),
        [
          { accountId: cashAccountId, amount: 1000, side: 'Debit' },
          { accountId: revenueAccountId, amount: 1000, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Pay rent',
        new Date('2025-07-15'),
        [
          { accountId: expenseAccountId, amount: 300, side: 'Debit' },
          { accountId: cashAccountId, amount: 300, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Owner contribution',
        new Date('2025-08-20'),
        [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: capitalAccountId, amount: 500, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Owner drawing',
        new Date('2025-09-10'),
        [
          { accountId: drawingAccountId, amount: 200, side: 'Debit' },
          { accountId: cashAccountId, amount: 200, side: 'Credit' }
        ]
      )

      const response = await request(app)
        .get('/api/reporting/balance-sheet')
        .query({
          userId,
          asOfDate: '2025-07-31T23:59:59Z'
        })
        .expect(200)

      const sheet = response.body.balanceSheet
      expect(sheet.asOfDate).toBe('2025-07-31T23:59:59.000Z')
      expect(sheet.assetTotal).toBe(700) // Cash 1000 - 300 = 700
      expect(sheet.liabilityTotal).toBe(0)
      // Equity: Capital 0, Revenue 1000, Expense 300, Drawing 0, Retained Earnings 700
      expect(sheet.equityTotal).toBe(700)
      expect(sheet.assets).toHaveLength(1)
      expect(sheet.assets[0].accountCode).toBe('101')
      expect(sheet.assets[0].amount).toBe(700)
      expect(sheet.equity).toHaveLength(3) // Capital, Drawing, Retained Earnings
    })

    it('should reject missing asOfDate', async () => {
      const userId = await createTestUser()
      const response = await request(app)
        .get('/api/reporting/balance-sheet')
        .query({ userId })
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })
  })

  describe('GET /api/reporting/owners-equity', () => {
    it('should generate statement of owner’s equity for a period', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')
      const expenseAccountId = await createTestAccount(userId, '501', 'Rent Expense', 'Expense', 'Debit')
      const capitalAccountId = await createTestAccount(userId, '301', 'Owner Capital', 'Equity', 'Credit')
      const drawingAccountId = await createTestAccount(userId, '302', 'Owner Drawing', 'Equity', 'Debit')

      // Same journal entries as above
      await createJournalEntry(
        userId,
        'Sale',
        new Date('2025-06-01'),
        [
          { accountId: cashAccountId, amount: 1000, side: 'Debit' },
          { accountId: revenueAccountId, amount: 1000, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Pay rent',
        new Date('2025-07-15'),
        [
          { accountId: expenseAccountId, amount: 300, side: 'Debit' },
          { accountId: cashAccountId, amount: 300, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Owner contribution',
        new Date('2025-08-20'),
        [
          { accountId: cashAccountId, amount: 500, side: 'Debit' },
          { accountId: capitalAccountId, amount: 500, side: 'Credit' }
        ]
      )
      await createJournalEntry(
        userId,
        'Owner drawing',
        new Date('2025-09-10'),
        [
          { accountId: drawingAccountId, amount: 200, side: 'Debit' },
          { accountId: cashAccountId, amount: 200, side: 'Credit' }
        ]
      )

      const response = await request(app)
        .get('/api/reporting/owners-equity')
        .query({
          userId,
          startDate: '2025-08-01T00:00:00Z',
          endDate: '2025-08-31T23:59:59Z'
        })
        .expect(200)

      const stmt = response.body.statementOfOwnersEquity
      expect(stmt.period.startDate).toBe('2025-08-01T00:00:00.000Z')
      expect(stmt.period.endDate).toBe('2025-08-31T23:59:59.000Z')
      expect(stmt.beginningCapital).toBeDefined()
      expect(stmt.additionalContributions).toBeDefined()
      expect(stmt.netIncome).toBeDefined()
      expect(stmt.drawings).toBeDefined()
      expect(stmt.endingCapital).toBeDefined()
      // In August, net income is 0 (no revenue/expense), contributions 500, drawings 0
      expect(stmt.additionalContributions).toBe(500)
      expect(stmt.netIncome).toBe(0)
      expect(stmt.drawings).toBe(0)
    })

    it('should fail when capital account missing', async () => {
      const userId = await createTestUser()
      // No capital account created

      const response = await request(app)
        .get('/api/reporting/owners-equity')
        .query({
          userId,
          startDate: '2025-08-01',
          endDate: '2025-08-31'
        })
        .expect(404) // DomainFailure with MissingCapitalAccount -> 404

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('MissingCapitalAccount')
    })
  })

  describe('GET /api/reporting/cash-flow', () => {
    it('should generate statement of cash flows (placeholder)', async () => {
      const userId = await createTestUser()
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')

      const response = await request(app)
        .get('/api/reporting/cash-flow')
        .query({
          userId,
          startDate: '2025-06-01T00:00:00Z',
          endDate: '2025-06-30T23:59:59Z'
        })
        .expect(200)

      const stmt = response.body.statementOfCashFlows
      expect(stmt.period.startDate).toBe('2025-06-01T00:00:00.000Z')
      expect(stmt.period.endDate).toBe('2025-06-30T23:59:59.000Z')
      expect(stmt.operatingActivities).toBeDefined()
      expect(stmt.investingActivities).toBeDefined()
      expect(stmt.financingActivities).toBeDefined()
      expect(stmt.netCashChange).toBeDefined()
      expect(stmt.beginningCash).toBeDefined()
      expect(stmt.endingCash).toBeDefined()
    })

    it('should fail when cash account missing', async () => {
      const userId = await createTestUser()
      // No cash account

      const response = await request(app)
        .get('/api/reporting/cash-flow')
        .query({
          userId,
          startDate: '2025-06-01',
          endDate: '2025-06-30'
        })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('CashAccountNotFound')
    })
  })

  describe('GET /api/reporting/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/reporting/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('reporting')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})