import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import {
  createSalesInvoice,
  findSalesInvoiceById,
  findSalesInvoiceByNumber,
  listSalesInvoices,
} from './salesInvoiceRepo'
import { createCustomer } from './customerRepo'
import { createJournalEntry } from '@/bounded-contexts/ledger/infrastructure/journalEntryRepo'
import { createAccount } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Sales Context: Sales Invoice Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  beforeEach(async () => {
    // Clean up sales-related tables in correct order
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

  const createTestAccount = async (userId: string, code: string, name: string, type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense', normalBalance: 'Debit' | 'Credit') => {
    const result = await createAccount({ userId, code, name, type, normalBalance })
    if (!result.isSuccess) {
      throw new Error('Failed to create test account')
    }
    return result.value
  }

  const createTestJournalEntry = async (userId: string, accountId: string) => {
    const result = await createJournalEntry({
      userId,
      entryNumber: 'TEST-001',
      description: 'Test journal entry',
      date: new Date(),
      lines: [
        { accountId, amount: 100, side: 'Debit' as const },
        { accountId, amount: 100, side: 'Credit' as const },
      ],
    })
    if (!result.isSuccess) {
      throw new Error('Failed to create test journal entry')
    }
    return result.value
  }

  it('should create a sales invoice with valid data', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const account = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const journalEntry = await createTestJournalEntry(user.id, account.id!)

    const invoiceData = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-001',
      total: 1000,
      status: 'Issued' as const,
      date: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days later
      description: 'Test invoice',
      journalEntryId: journalEntry.id!,
    }

    const result = await createSalesInvoice(invoiceData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const invoice = result.value
      expect(invoice.userId).toBe(user.id)
      expect(invoice.customerId).toBe(customer.id)
      expect(invoice.invoiceNumber).toBe('INV-2025-001')
      expect(invoice.total).toBe(1000)
      expect(invoice.status).toBe('Issued')
      expect(invoice.journalEntryId).toBe(journalEntry.id)
      expect(invoice.id).toBeDefined()
      expect(invoice.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbInvoice = await prisma.salesInvoice.findFirst({
      where: { userId: user.id, invoiceNumber: 'INV-2025-001' },
    })
    expect(dbInvoice).not.toBeNull()
  })

  it('should find a sales invoice by ID', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const account = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const journalEntry = await createTestJournalEntry(user.id, account.id!)

    const invoiceData = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-002',
      total: 500,
      status: 'Issued' as const,
      date: new Date(),
      journalEntryId: journalEntry.id!,
    }
    const createResult = await createSalesInvoice(invoiceData)
    expect(createResult.isSuccess).toBe(true)
    const createdInvoice = createResult.isSuccess ? createResult.value : null
    expect(createdInvoice).not.toBeNull()

    const findResult = await findSalesInvoiceById(user.id, createdInvoice!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdInvoice!.id)
      expect(findResult.value?.invoiceNumber).toBe('INV-2025-002')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a sales invoice belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const customer = await createTestCustomer(userA.id)
    const account = await createTestAccount(userA.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const journalEntry = await createTestJournalEntry(userA.id, account.id!)

    const invoiceData = {
      userId: userA.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-003',
      total: 300,
      status: 'Issued' as const,
      date: new Date(),
      journalEntryId: journalEntry.id!,
    }
    const createResult = await createSalesInvoice(invoiceData)
    expect(createResult.isSuccess).toBe(true)
    const createdInvoice = createResult.isSuccess ? createResult.value : null
    expect(createdInvoice).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findSalesInvoiceById(userB.id, createdInvoice!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the invoice belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should find a sales invoice by invoice number', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const account = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const journalEntry = await createTestJournalEntry(user.id, account.id!)

    const invoiceData = {
      userId: user.id,
      customerId: customer.id!,
      invoiceNumber: 'INV-2025-004',
      total: 700,
      status: 'Issued' as const,
      date: new Date(),
      journalEntryId: journalEntry.id!,
    }
    const createResult = await createSalesInvoice(invoiceData)
    expect(createResult.isSuccess).toBe(true)

    const findResult = await findSalesInvoiceByNumber(user.id, 'INV-2025-004')
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value).not.toBeNull()
      expect(findResult.value!.invoiceNumber).toBe('INV-2025-004')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list sales invoices for a user', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const account = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    const journalEntry1 = await createTestJournalEntry(user.id, account.id!)
    const journalEntry2 = await createTestJournalEntry(user.id, account.id!)

    const invoices = [
      {
        userId: user.id,
        customerId: customer.id!,
        invoiceNumber: 'INV-2025-005',
        total: 100,
        status: 'Issued' as const,
        date: new Date(),
        journalEntryId: journalEntry1.id!,
      },
      {
        userId: user.id,
        customerId: customer.id!,
        invoiceNumber: 'INV-2025-006',
        total: 200,
        status: 'Paid' as const,
        date: new Date(),
        journalEntryId: journalEntry2.id!,
      },
    ]
    for (const inv of invoices) {
      const result = await createSalesInvoice(inv)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listSalesInvoices(user.id, { skip: 0, take: 10 })
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const numbers = listResult.value.map(i => i.invoiceNumber)
      expect(numbers).toContain('INV-2025-005')
      expect(numbers).toContain('INV-2025-006')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list sales invoices with pagination', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const account = await createTestAccount(user.id, '111', 'Accounts Receivable', 'Asset', 'Debit')
    // Create 5 invoices
    for (let i = 1; i <= 5; i++) {
      const journalEntry = await createTestJournalEntry(user.id, account.id!)
      const invoiceData = {
        userId: user.id,
        customerId: customer.id!,
        invoiceNumber: `INV-2025-${i}`,
        total: i * 100,
        status: 'Issued' as const,
        date: new Date(),
        journalEntryId: journalEntry.id!,
      }
      const result = await createSalesInvoice(invoiceData)
      expect(result.isSuccess).toBe(true)
    }

    // Take first 2
    const listResult = await listSalesInvoices(user.id, { skip: 0, take: 2 })
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
    }

    // Skip 2, take 3
    const listResult2 = await listSalesInvoices(user.id, { skip: 2, take: 3 })
    expect(listResult2.isSuccess).toBe(true)
    if (listResult2.isSuccess) {
      expect(listResult2.value).toHaveLength(3)
    }
  })
})