import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { issueSalesInvoiceWorkflow } from '@/bounded-contexts/sales/application/issueSalesInvoiceWorkflow'
import { createCustomer } from '@/bounded-contexts/sales/infrastructure/customerRepo'
import { createAccount } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Sales Context: Issue Sales Invoice Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  beforeEach(async () => {
    // Clean up sales-related tables in correct order
    await prisma.payment.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.account.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (id: string = 'test-user-123', username: string = 'testuser123') => {
    return await prisma.user.create({
      data: { id, username },
    })
  }

  const createTestCustomer = async (userId: string, name: string = 'Test Customer') => {
    const result = await createCustomer({ userId, name })
    if (!result.isSuccess) {
      throw new Error('Failed to create test customer')
    }
    return result.value
  }

  const createTestAccount = async (
    userId: string,
    code: string,
    name: string,
    type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense',
    normalBalance: 'Debit' | 'Credit'
  ) => {
    const result = await createAccount({ userId, code, name, type, normalBalance })
    if (!result.isSuccess) {
      throw new Error('Failed to create test account')
    }
    return result.value
  }

  it('should issue a sales invoice with valid data', { timeout: 15000 }, async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    // Create required default accounts: 111 (Accounts Receivable) and 401 (Service Revenue)
    const arAccount = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const revenueAccount = await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-001',
      total: 1500.50,
      date: '2025-01-15T00:00:00Z',
      dueDate: '2025-02-15T00:00:00Z',
      description: 'Consulting services for January',
    }

    const result = await issueSalesInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const invoice = result.value
      expect(invoice.userId).toBe(user.id)
      expect(invoice.customerId).toBe(customer.id)
      expect(invoice.invoiceNumber).toBe('INV-2025-001')
      expect(invoice.total).toBe(1500.50)
      expect(invoice.status).toBe('Issued')
      expect(invoice.date).toEqual(new Date('2025-01-15T00:00:00Z'))
      expect(invoice.dueDate).toEqual(new Date('2025-02-15T00:00:00Z'))
      expect(invoice.description).toBe('Consulting services for January')
      expect(invoice.journalEntryId).toBeDefined()
      expect(invoice.id).toBeDefined()

      // Verify that a journal entry was created and linked
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: invoice.journalEntryId },
      })
      expect(journalEntry).not.toBeNull()
      expect(journalEntry?.userId).toBe(user.id)
      expect(journalEntry?.description).toBe('Consulting services for January')

      // Verify that the customer balance was updated
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer.id! },
      })
      expect(updatedCustomer).not.toBeNull()
      expect(Number(updatedCustomer!.balance)).toBe(1500.50)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should reject invalid invoice number (empty)', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: '', // invalid
      total: 100,
      date: '2025-01-15T00:00:00Z',
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidInvoiceNumber')
    }
  })

  it('should reject negative total', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-002',
      total: -50, // invalid
      date: '2025-01-15T00:00:00Z',
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidInvoiceTotal')
    }
  })

  it('should reject future invoice date', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 1)
    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-003',
      total: 100,
      date: futureDate.toISOString(),
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvoiceDateInFuture')
    }
  })

  it('should reject duplicate invoice number for the same user', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-004',
      total: 100,
      date: '2025-01-15T00:00:00Z',
    }

    const firstResult = await issueSalesInvoiceWorkflow(command)
    expect(firstResult.isSuccess).toBe(true)

    const secondResult = await issueSalesInvoiceWorkflow(command)
    expect(secondResult.isSuccess).toBe(false)
    if (!secondResult.isSuccess) {
      expect(secondResult.error.type).toBe('DomainFailure')
      expect(secondResult.error.subtype).toBe('DuplicateInvoiceNumber')
    }
  })

  it('should reject if customer does not exist', async () => {
    const user = await createTestUser()
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: 'non-existent-customer-id',
      invoiceNumber: 'INV-2025-005',
      total: 100,
      date: '2025-01-15T00:00:00Z',
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('CustomerNotFound')
    }
  })

  it('should reject if default accounts are missing', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    // Do not create the required accounts

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-006',
      total: 100,
      date: '2025-01-15T00:00:00Z',
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })

  it('should reject if due date is before invoice date', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    await createTestAccount(user.id, '401', 'Service Revenue', 'Revenue', 'Credit')

    const command = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-007',
      total: 100,
      date: '2025-01-15T00:00:00Z',
      dueDate: '2025-01-10T00:00:00Z', // earlier than invoice date
    }

    const result = await issueSalesInvoiceWorkflow(command)
    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidDueDate')
    }
  })
})