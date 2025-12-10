import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('Purchasing Context: API Routes (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test in the correct order to avoid FK constraints
  beforeEach(async () => {
    await prisma.loanPayment.deleteMany()
    await prisma.loan.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.vendor.deleteMany()
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
  const createTestUser = async (username: string = 'test_user_purchasing') => {
    const user = await prisma.user.create({
      data: { username }
    })
    return user.id
  }

  // Helper to create a test account and return its ID
  const createTestAccount = async (
    userId: string,
    code: string = '101',
    name: string = 'Cash',
    type: AccountType = 'Asset',
    normalBalance: NormalBalance = 'Debit'
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

  // Helper to create a test vendor and return its ID
  const createTestVendor = async (
    userId: string,
    name: string = 'Test Vendor',
    email?: string
  ) => {
    const vendor = await prisma.vendor.create({
      data: {
        userId,
        name,
        email
      }
    })
    return vendor.id
  }

  describe('POST /api/purchasing/vendors', () => {
    it('should create a vendor with valid data', async () => {
      const userId = await createTestUser()
      const vendorData = {
        userId,
        name: 'Acme Supplies',
        email: 'acme@example.com'
      }

      const response = await request(app)
        .post('/api/purchasing/vendors')
        .send(vendorData)
        .expect(201)

      expect(response.body.vendor).toMatchObject({
        name: 'Acme Supplies',
        email: 'acme@example.com',
        userId,
        balance: 0
      })
      expect(response.body.vendor.id).toBeDefined()
      expect(response.body.message).toBe('Vendor created successfully')

      // Verify in database
      const dbVendor = await prisma.vendor.findUnique({
        where: { id: response.body.vendor.id }
      })
      expect(dbVendor).not.toBeNull()
      expect(dbVendor?.name).toBe('Acme Supplies')
    })

    it('should create a vendor without email', async () => {
      const userId = await createTestUser()
      const vendorData = {
        userId,
        name: 'Acme Supplies'
      }

      const response = await request(app)
        .post('/api/purchasing/vendors')
        .send(vendorData)
        .expect(201)

      expect(response.body.vendor.email).toBeUndefined()
      expect(response.body.vendor.name).toBe('Acme Supplies')
    })

    it('should reject missing userId', async () => {
      const vendorData = {
        name: 'Acme Supplies'
      }

      const response = await request(app)
        .post('/api/purchasing/vendors')
        .send(vendorData)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/userId is required/)
    })

    it('should reject missing name', async () => {
      const userId = await createTestUser()
      const vendorData = {
        userId
      }

      const response = await request(app)
        .post('/api/purchasing/vendors')
        .send(vendorData)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/name is required/)
    })

    it('should reject invalid email format', async () => {
      const userId = await createTestUser()
      const vendorData = {
        userId,
        name: 'Acme Supplies',
        email: 'not-an-email'
      }

      const response = await request(app)
        .post('/api/purchasing/vendors')
        .send(vendorData)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidVendorEmail')
    })
  })

  describe('GET /api/purchasing/vendors', () => {
    it('should list vendors for a user', async () => {
      const userId = await createTestUser()
      // Create two vendors for this user
      await createTestVendor(userId, 'Vendor A')
      await createTestVendor(userId, 'Vendor B', 'b@example.com')

      const response = await request(app)
        .get('/api/purchasing/vendors')
        .query({ userId })
        .expect(200)

      expect(response.body.vendors).toHaveLength(2)
      expect(response.body.count).toBe(2)
      const names = response.body.vendors.map((v: any) => v.name)
      expect(names).toContain('Vendor A')
      expect(names).toContain('Vendor B')
    })

    it('should return empty list when user has no vendors', async () => {
      const userId = await createTestUser()

      const response = await request(app)
        .get('/api/purchasing/vendors')
        .query({ userId })
        .expect(200)

      expect(response.body.vendors).toEqual([])
      expect(response.body.count).toBe(0)
    })

    it('should reject missing userId query parameter', async () => {
      const response = await request(app)
        .get('/api/purchasing/vendors')
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/userId query parameter is required/)
    })
  })

  describe('POST /api/purchasing/vendor-bills', () => {
    it('should record a vendor bill successfully', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId, 'Bill Vendor')
      // Create required accounts: 201 (Accounts Payable) and 501 (Salaries Expense)
      const apAccountId = await createTestAccount(userId, '201', 'Accounts Payable', 'Liability', 'Credit')
      const expenseAccountId = await createTestAccount(userId, '501', 'Salaries Expense', 'Expense', 'Debit')

      const billData = {
        userId,
        vendorId,
        billNumber: 'BILL-001',
        amount: 1500.50,
        date: '2025-01-15T00:00:00Z',
        dueDate: '2025-02-15T00:00:00Z',
        description: 'Office supplies purchase'
      }

      const response = await request(app)
        .post('/api/purchasing/vendor-bills')
        .send(billData)
        .expect(201)

      expect(response.body.bill).toMatchObject({
        billNumber: 'BILL-001',
        amount: 1500.50,
        status: 'Recorded',
        vendorId,
        userId
      })
      expect(response.body.bill.id).toBeDefined()
      expect(response.body.message).toBe('Vendor bill recorded successfully')

      // Verify that a journal entry was created and linked
      const dbBill = await prisma.vendorBill.findUnique({
        where: { id: response.body.bill.id },
        include: { journalEntry: true }
      })
      expect(dbBill).not.toBeNull()
      expect(dbBill?.journalEntryId).toBeDefined()
      expect(dbBill?.journalEntry?.description).toBe('Office supplies purchase')
    })

    it('should reject missing required fields', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId)

      const missingAmount = {
        userId,
        vendorId,
        billNumber: 'BILL-001',
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/purchasing/vendor-bills')
        .send(missingAmount)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/amount must be a positive number/)
    })

    it('should reject duplicate bill number for same user', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId)
      await createTestAccount(userId, '201', 'Accounts Payable', 'Liability', 'Credit')
      await createTestAccount(userId, '501', 'Salaries Expense', 'Expense', 'Debit')

      const firstBill = {
        userId,
        vendorId,
        billNumber: 'DUPLICATE-001',
        amount: 1000,
        date: '2025-01-01T00:00:00Z'
      }
      await request(app)
        .post('/api/purchasing/vendor-bills')
        .send(firstBill)
        .expect(201)

      const secondBill = {
        userId,
        vendorId,
        billNumber: 'DUPLICATE-001',
        amount: 2000,
        date: '2025-01-02T00:00:00Z'
      }
      const response = await request(app)
        .post('/api/purchasing/vendor-bills')
        .send(secondBill)
        .expect(409)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('DuplicateBillNumber')
    })

    it('should return 404 when vendor does not exist', async () => {
      const userId = await createTestUser()
      const fakeVendorId = '550e8400-e29b-41d4-a716-446655440000'
      await createTestAccount(userId, '201', 'AP', 'Liability', 'Credit')
      await createTestAccount(userId, '501', 'Expense', 'Expense', 'Debit')

      const billData = {
        userId,
        vendorId: fakeVendorId,
        billNumber: 'BILL-001',
        amount: 1000,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/purchasing/vendor-bills')
        .send(billData)
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('VendorNotFound')
    })
  })

  describe('POST /api/purchasing/loan-payments', () => {
    it('should record a loan payment successfully', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId, 'Loan Vendor')
      // Create required accounts: 101 (Cash), 251 (Notes Payable) and 505 (Interest Expense)
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const notesPayableId = await createTestAccount(userId, '251', 'Notes Payable', 'Liability', 'Credit')
      const interestExpenseId = await createTestAccount(userId, '505', 'Interest Expense', 'Expense', 'Debit')
      // Create a loan for the vendor and capture its ID
      const loan = await prisma.loan.create({
        data: {
          userId,
          vendorId,
          principal: 1000, // enough for the payment
        }
      })

      const paymentData = {
        userId,
        vendorId,
        principalAmount: 500,
        interestAmount: 50,
        date: '2025-01-15T00:00:00Z',
        description: 'Monthly loan payment'
      }

      const response = await request(app)
        .post('/api/purchasing/loan-payments')
        .send(paymentData)
        .expect(201)

      expect(response.body.loanPayment).toMatchObject({
        loanId: loan.id,
        principalAmount: 500,
        interestAmount: 50,
      })
      expect(response.body.loanPayment.id).toBeDefined()
      expect(response.body.loanPayment.userId).toBeUndefined() // Not part of domain
      expect(response.body.loanPayment.vendorId).toBeUndefined() // Not part of domain
      expect(response.body.message).toBe('Loan payment recorded successfully')

      // Verify that a journal entry was created and linked
      const dbPayment = await prisma.loanPayment.findUnique({
        where: { id: response.body.loanPayment.id },
        include: { journalEntry: true }
      })
      expect(dbPayment).not.toBeNull()
      expect(dbPayment?.journalEntryId).toBeDefined()
      expect(dbPayment?.journalEntry?.description).toBe('Monthly loan payment')
    })

    it('should reject missing required fields', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId)

      const missingPrincipal = {
        userId,
        vendorId,
        interestAmount: 50,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/purchasing/loan-payments')
        .send(missingPrincipal)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/principalAmount must be a positive number/)
    })

    it('should return 404 when vendor does not exist', async () => {
      const userId = await createTestUser()
      const fakeVendorId = '550e8400-e29b-41d4-a716-446655440000'
      await createTestAccount(userId, '251', 'Notes Payable', 'Liability', 'Credit')
      await createTestAccount(userId, '505', 'Interest Expense', 'Expense', 'Debit')

      const paymentData = {
        userId,
        vendorId: fakeVendorId,
        principalAmount: 500,
        interestAmount: 50,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/purchasing/loan-payments')
        .send(paymentData)
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('VendorNotFound')
    })
  })

  describe('POST /api/purchasing/cash-expenses', () => {
    it('should record a cash expense successfully', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId, 'Expense Vendor')
      // Create required accounts: 101 (Cash) and 501 (Salaries Expense)
      const cashAccountId = await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      const expenseAccountId = await createTestAccount(userId, '501', 'Salaries Expense', 'Expense', 'Debit')

      const expenseData = {
        userId,
        vendorId,
        amount: 200.75,
        date: '2025-01-15T00:00:00Z',
        expenseCategory: 'Office Supplies',
        description: 'Printer paper'
      }

      const response = await request(app)
        .post('/api/purchasing/cash-expenses')
        .send(expenseData)
        .expect(201)

      expect(response.body.cashExpense).toMatchObject({
        amount: 200.75,
        expenseCategory: 'Office Supplies',
        vendorId,
        userId
      })
      expect(response.body.cashExpense.id).toBeDefined()
      expect(response.body.message).toBe('Cash expense recorded successfully')

      // Verify that a journal entry was created and linked
      const dbExpense = await prisma.cashExpense.findUnique({
        where: { id: response.body.cashExpense.id },
        include: { journalEntry: true }
      })
      expect(dbExpense).not.toBeNull()
      expect(dbExpense?.journalEntryId).toBeDefined()
      expect(dbExpense?.journalEntry?.description).toBe('Printer paper')
    })

    it('should reject missing required fields', async () => {
      const userId = await createTestUser()
      const vendorId = await createTestVendor(userId)

      const missingAmount = {
        userId,
        vendorId,
        date: '2025-01-15T00:00:00Z',
        expenseCategory: 'Travel'
      }

      const response = await request(app)
        .post('/api/purchasing/cash-expenses')
        .send(missingAmount)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/amount must be a positive number/)
    })

    it('should return 404 when vendor does not exist', async () => {
      const userId = await createTestUser()
      const fakeVendorId = '550e8400-e29b-41d4-a716-446655440000'
      await createTestAccount(userId, '101', 'Cash', 'Asset', 'Debit')
      await createTestAccount(userId, '501', 'Salaries Expense', 'Expense', 'Debit')

      const expenseData = {
        userId,
        vendorId: fakeVendorId,
        amount: 100,
        date: '2025-01-15T00:00:00Z',
        expenseCategory: 'Meals'
      }

      const response = await request(app)
        .post('/api/purchasing/cash-expenses')
        .send(expenseData)
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('VendorNotFound')
    })
  })

  describe('GET /api/purchasing/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/purchasing/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('purchasing')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})