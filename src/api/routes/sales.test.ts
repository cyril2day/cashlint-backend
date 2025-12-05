import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'
import type { AccountType, NormalBalance } from '@/bounded-contexts/ledger/domain/ledger'

describe('Sales Context: API Routes (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up the database before every test in the correct order to avoid FK constraints
  beforeEach(async () => {
    await prisma.payment.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.salesInvoice.deleteMany()
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
  const createTestUser = async (username: string = 'test_user_sales') => {
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

  // Helper to create a test customer and return its ID
  const createTestCustomer = async (
    userId: string,
    name: string = 'Test Customer',
    email?: string
  ) => {
    const customer = await prisma.customer.create({
      data: {
        userId,
        name,
        email
      }
    })
    return customer.id
  }

  describe('POST /api/sales/customers', () => {
    it('should create a customer with valid data', async () => {
      const userId = await createTestUser()
      const customerData = {
        userId,
        name: 'Acme Corp',
        email: 'acme@example.com'
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(201)

      expect(response.body.customer).toMatchObject({
        name: 'Acme Corp',
        email: 'acme@example.com',
        userId
      })
      expect(response.body.customer.id).toBeDefined()
      expect(response.body.message).toBe('Customer created successfully')

      // Verify in database
      const dbCustomer = await prisma.customer.findUnique({
        where: { id: response.body.customer.id }
      })
      expect(dbCustomer).not.toBeNull()
      expect(dbCustomer?.name).toBe('Acme Corp')
    })

    it('should create a customer without email', async () => {
      const userId = await createTestUser()
      const customerData = {
        userId,
        name: 'Acme Corp'
        // email omitted
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(201)

      expect(response.body.customer.email).toBeUndefined()
      expect(response.body.customer.name).toBe('Acme Corp')
    })

    it('should reject missing userId', async () => {
      const customerData = {
        name: 'Acme Corp'
        // userId omitted
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/userId is required/)
    })

    it('should reject missing name', async () => {
      const userId = await createTestUser()
      const customerData = {
        userId
        // name omitted
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/name is required/)
    })

    it('should reject non-string name', async () => {
      const userId = await createTestUser()
      const customerData = {
        userId,
        name: 12345
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject invalid email format', async () => {
      const userId = await createTestUser()
      const customerData = {
        userId,
        name: 'Acme Corp',
        email: 'not-an-email'
      }

      const response = await request(app)
        .post('/api/sales/customers')
        .send(customerData)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvalidCustomerEmail')
    })
  })

  describe('GET /api/sales/customers', () => {
    it('should list customers for a user', async () => {
      const userId = await createTestUser()
      // Create two customers for this user
      await createTestCustomer(userId, 'Customer A')
      await createTestCustomer(userId, 'Customer B', 'b@example.com')

      const response = await request(app)
        .get('/api/sales/customers')
        .query({ userId })
        .expect(200)

      expect(response.body.customers).toHaveLength(2)
      expect(response.body.count).toBe(2)
      // Should be sorted by createdAt descending? Not specified, but we can just check presence
      const names = response.body.customers.map((c: any) => c.name)
      expect(names).toContain('Customer A')
      expect(names).toContain('Customer B')
    })

    it('should return empty list when user has no customers', async () => {
      const userId = await createTestUser()

      const response = await request(app)
        .get('/api/sales/customers')
        .query({ userId })
        .expect(200)

      expect(response.body.customers).toEqual([])
      expect(response.body.count).toBe(0)
    })

    it('should reject missing userId query parameter', async () => {
      const response = await request(app)
        .get('/api/sales/customers')
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/userId query parameter is required/)
    })

    it('should accept numeric string userId', async () => {
      const response = await request(app)
        .get('/api/sales/customers')
        .query({ userId: 123 })
        .expect(200)

      expect(response.body.customers).toEqual([])
      expect(response.body.count).toBe(0)
    })
  })

  describe('GET /api/sales/customers/:customerId', () => {
    it('should retrieve a customer by ID', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId, 'Specific Customer', 'specific@example.com')

      const response = await request(app)
        .get(`/api/sales/customers/${customerId}`)
        .query({ userId })
        .expect(200)

      expect(response.body.customer.id).toBe(customerId)
      expect(response.body.customer.name).toBe('Specific Customer')
      expect(response.body.customer.email).toBe('specific@example.com')
    })

    it('should return 404 when customer does not exist', async () => {
      const userId = await createTestUser()
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000'

      const response = await request(app)
        .get(`/api/sales/customers/${nonExistentId}`)
        .query({ userId })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('CustomerNotFound')
    })

    it('should return 404 when customer belongs to another user', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')
      const customerId = await createTestCustomer(user1, 'Customer for user1')

      // user2 tries to fetch customer created by user1
      const response = await request(app)
        .get(`/api/sales/customers/${customerId}`)
        .query({ userId: user2 })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('CustomerNotFound')
    })

    it('should reject missing userId query parameter', async () => {
      const customerId = 'some-id'
      const response = await request(app)
        .get(`/api/sales/customers/${customerId}`)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })
  })

  describe('POST /api/sales/invoices', () => {
    it('should issue a sales invoice successfully', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId, 'Invoice Customer')
      // Create required accounts: 111 (Accounts Receivable) and 401 (Service Revenue)
      const arAccountId = await createTestAccount(userId, '111', 'Accounts Receivable', 'Asset', 'Debit')
      const revenueAccountId = await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const invoiceData = {
        userId,
        customerId,
        invoiceNumber: 'INV-001',
        total: 1500.50,
        date: '2025-01-15T00:00:00Z',
        dueDate: '2025-02-15T00:00:00Z',
        description: 'Web design services'
      }

      const response = await request(app)
        .post('/api/sales/invoices')
        .send(invoiceData)
        .expect(201)

      expect(response.body.invoice).toMatchObject({
        invoiceNumber: 'INV-001',
        total: 1500.50,
        status: 'Issued',
        customerId,
        userId
      })
      expect(response.body.invoice.id).toBeDefined()
      expect(response.body.message).toBe('Invoice issued successfully')

      // Verify that a journal entry was created and linked
      const dbInvoice = await prisma.salesInvoice.findUnique({
        where: { id: response.body.invoice.id },
        include: { journalEntry: true }
      })
      expect(dbInvoice).not.toBeNull()
      expect(dbInvoice?.journalEntryId).toBeDefined()
      expect(dbInvoice?.journalEntry?.description).toBe('Web design services')
    })

    it('should reject missing required fields', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)

      const missingTotal = {
        userId,
        customerId,
        invoiceNumber: 'INV-001',
        date: '2025-01-15T00:00:00Z'
        // total omitted
      }

      const response = await request(app)
        .post('/api/sales/invoices')
        .send(missingTotal)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
      expect(response.body.error.message).toMatch(/total must be a positive number/)
    })

    it('should reject invalid total (negative)', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)

      const invalidTotal = {
        userId,
        customerId,
        invoiceNumber: 'INV-001',
        total: -100,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/sales/invoices')
        .send(invalidTotal)
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })

    it('should reject duplicate invoice number for same user', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)
      await createTestAccount(userId, '111', 'Accounts Receivable', 'Asset', 'Debit')
      await createTestAccount(userId, '401', 'Service Revenue', 'Revenue', 'Credit')

      const firstInvoice = {
        userId,
        customerId,
        invoiceNumber: 'DUPLICATE-001',
        total: 1000,
        date: '2025-01-01T00:00:00Z'
      }
      await request(app)
        .post('/api/sales/invoices')
        .send(firstInvoice)
        .expect(201)

      const secondInvoice = {
        userId,
        customerId,
        invoiceNumber: 'DUPLICATE-001',
        total: 2000,
        date: '2025-01-02T00:00:00Z'
      }
      const response = await request(app)
        .post('/api/sales/invoices')
        .send(secondInvoice)
        .expect(409)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('DuplicateInvoiceNumber')
    })

    it('should allow same invoice number for different users', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')
      const customer1 = await createTestCustomer(user1, 'Cust1')
      const customer2 = await createTestCustomer(user2, 'Cust2')
      await createTestAccount(user1, '111', 'AR', 'Asset', 'Debit')
      await createTestAccount(user1, '401', 'Revenue', 'Revenue', 'Credit')
      await createTestAccount(user2, '111', 'AR', 'Asset', 'Debit')
      await createTestAccount(user2, '401', 'Revenue', 'Revenue', 'Credit')

      const invoiceData = {
        invoiceNumber: 'SAME-001',
        total: 500,
        date: '2025-01-10T00:00:00Z'
      }

      // First user
      await request(app)
        .post('/api/sales/invoices')
        .send({ ...invoiceData, userId: user1, customerId: customer1 })
        .expect(201)

      // Second user
      await request(app)
        .post('/api/sales/invoices')
        .send({ ...invoiceData, userId: user2, customerId: customer2 })
        .expect(201)

      const invoices = await prisma.salesInvoice.findMany({
        where: { invoiceNumber: 'SAME-001' }
      })
      expect(invoices).toHaveLength(2)
    })

    it('should return 404 when customer does not exist', async () => {
      const userId = await createTestUser()
      const fakeCustomerId = '550e8400-e29b-41d4-a716-446655440000'
      await createTestAccount(userId, '111', 'AR', 'Asset', 'Debit')
      await createTestAccount(userId, '401', 'Revenue', 'Revenue', 'Credit')

      const invoiceData = {
        userId,
        customerId: fakeCustomerId,
        invoiceNumber: 'INV-001',
        total: 1000,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/sales/invoices')
        .send(invoiceData)
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('CustomerNotFound')
    })

    it('should return 400 when required accounts are missing', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)
      // Do not create accounts 111 and 401

      const invoiceData = {
        userId,
        customerId,
        invoiceNumber: 'INV-001',
        total: 1000,
        date: '2025-01-15T00:00:00Z'
      }

      const response = await request(app)
        .post('/api/sales/invoices')
        .send(invoiceData)
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('AccountNotFound')
    })
  })

  describe('GET /api/sales/invoices', () => {
    it('should list invoices for a user', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)
      // Create accounts and invoices via the API (or directly). We'll use direct creation for speed.
      const arId = await createTestAccount(userId, '111', 'AR', 'Asset', 'Debit')
      const revenueId = await createTestAccount(userId, '401', 'Revenue', 'Revenue', 'Credit')

      // Create two journal entries and invoices manually
      const journalEntry1 = await prisma.journalEntry.create({
        data: {
          userId,
          description: 'Invoice 1',
          date: new Date('2025-01-01')
        }
      })
      const invoice1 = await prisma.salesInvoice.create({
        data: {
          userId,
          customerId,
          invoiceNumber: 'INV-001',
          total: 1000,
          date: new Date('2025-01-01'),
          status: 'Issued',
          journalEntryId: journalEntry1.id
        }
      })

      const journalEntry2 = await prisma.journalEntry.create({
        data: {
          userId,
          description: 'Invoice 2',
          date: new Date('2025-01-02')
        }
      })
      await prisma.salesInvoice.create({
        data: {
          userId,
          customerId,
          invoiceNumber: 'INV-002',
          total: 2000,
          date: new Date('2025-01-02'),
          status: 'Paid',
          journalEntryId: journalEntry2.id
        }
      })

      const response = await request(app)
        .get('/api/sales/invoices')
        .query({ userId })
        .expect(200)

      expect(response.body.invoices).toHaveLength(2)
      expect(response.body.count).toBe(2)
      // Should be ordered by date descending (default in repo)
      const invoiceNumbers = response.body.invoices.map((inv: any) => inv.invoiceNumber)
      expect(invoiceNumbers).toEqual(['INV-002', 'INV-001'])
    })

    it('should support pagination', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)
      const arId = await createTestAccount(userId, '111', 'AR', 'Asset', 'Debit')
      const revenueId = await createTestAccount(userId, '401', 'Revenue', 'Revenue', 'Credit')

      // Create 5 invoices
      for (let i = 1; i <= 5; i++) {
        const journalEntry = await prisma.journalEntry.create({
          data: {
            userId,
            description: `Invoice ${i}`,
            date: new Date(`2025-01-${i.toString().padStart(2, '0')}`)
          }
        })
        await prisma.salesInvoice.create({
          data: {
            userId,
            customerId,
            invoiceNumber: `INV-${i}`,
            total: i * 100,
            date: new Date(`2025-01-${i.toString().padStart(2, '0')}`),
            status: 'Issued',
            journalEntryId: journalEntry.id
          }
        })
      }

      // Get first page of 2
      const response1 = await request(app)
        .get('/api/sales/invoices')
        .query({ userId, skip: 0, take: 2 })
        .expect(200)

      expect(response1.body.invoices).toHaveLength(2)
      expect(response1.body.invoices[0].invoiceNumber).toBe('INV-5')
      expect(response1.body.invoices[1].invoiceNumber).toBe('INV-4')

      // Get second page of 2
      const response2 = await request(app)
        .get('/api/sales/invoices')
        .query({ userId, skip: 2, take: 2 })
        .expect(200)

      expect(response2.body.invoices).toHaveLength(2)
      expect(response2.body.invoices[0].invoiceNumber).toBe('INV-3')
      expect(response2.body.invoices[1].invoiceNumber).toBe('INV-2')
    })

    it('should reject missing userId', async () => {
      const response = await request(app)
        .get('/api/sales/invoices')
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('MissingField')
    })
  })

  describe('GET /api/sales/invoices/:invoiceId', () => {
    it('should retrieve an invoice by ID', async () => {
      const userId = await createTestUser()
      const customerId = await createTestCustomer(userId)
      const arId = await createTestAccount(userId, '111', 'AR', 'Asset', 'Debit')
      const revenueId = await createTestAccount(userId, '401', 'Revenue', 'Revenue', 'Credit')

      const journalEntry = await prisma.journalEntry.create({
        data: {
          userId,
          description: 'Test invoice',
          date: new Date('2025-01-10')
        }
      })
      const invoice = await prisma.salesInvoice.create({
        data: {
          userId,
          customerId,
          invoiceNumber: 'INV-SPECIFIC',
          total: 1234.56,
          date: new Date('2025-01-10'),
          status: 'Issued',
          journalEntryId: journalEntry.id
        }
      })

      const response = await request(app)
        .get(`/api/sales/invoices/${invoice.id}`)
        .query({ userId })
        .expect(200)

      expect(response.body.invoice.id).toBe(invoice.id)
      expect(response.body.invoice.invoiceNumber).toBe('INV-SPECIFIC')
      expect(response.body.invoice.total).toBe(1234.56)
    })

    it('should return 404 when invoice does not exist', async () => {
      const userId = await createTestUser()
      const nonExistentId = '550e8400-e29b-41d4-a716-446655440000'

      const response = await request(app)
        .get(`/api/sales/invoices/${nonExistentId}`)
        .query({ userId })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvoiceNotFound')
    })

    it('should return 404 when invoice belongs to another user', async () => {
      const user1 = await createTestUser('user1')
      const user2 = await createTestUser('user2')
      const customer1 = await createTestCustomer(user1)
      const arId = await createTestAccount(user1, '111', 'AR', 'Asset', 'Debit')
      const revenueId = await createTestAccount(user1, '401', 'Revenue', 'Revenue', 'Credit')

      const journalEntry = await prisma.journalEntry.create({
        data: {
          userId: user1,
          description: 'Invoice for user1',
          date: new Date('2025-01-10')
        }
      })
      const invoice = await prisma.salesInvoice.create({
        data: {
          userId: user1,
          customerId: customer1,
          invoiceNumber: 'INV-OTHER',
          total: 1000,
          date: new Date('2025-01-10'),
          status: 'Issued',
          journalEntryId: journalEntry.id
        }
      })

      // user2 tries to fetch it
      const response = await request(app)
        .get(`/api/sales/invoices/${invoice.id}`)
        .query({ userId: user2 })
        .expect(404)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.subtype).toBe('InvoiceNotFound')
    })
  })

  describe('POST /api/sales/invoices/:invoiceId/payments', () => {
    it('should return 501 Not Implemented', async () => {
      const userId = await createTestUser()
      const invoiceId = 'some-id'

      const response = await request(app)
        .post(`/api/sales/invoices/${invoiceId}/payments`)
        .send({ userId, amount: 100 })
        .expect(501)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('NotImplemented')
    })
  })

  describe('POST /api/sales/cash-sales', () => {
    it('should return 501 Not Implemented', async () => {
      const userId = await createTestUser()

      const response = await request(app)
        .post('/api/sales/cash-sales')
        .send({ userId, amount: 100 })
        .expect(501)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('NotImplemented')
    })
  })

  describe('POST /api/sales/customer-deposits', () => {
    it('should return 501 Not Implemented', async () => {
      const userId = await createTestUser()

      const response = await request(app)
        .post('/api/sales/customer-deposits')
        .send({ userId, amount: 100 })
        .expect(501)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.subtype).toBe('NotImplemented')
    })
  })

  describe('GET /api/sales/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/sales/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('sales')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})