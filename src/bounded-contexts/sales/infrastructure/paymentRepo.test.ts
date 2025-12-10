import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createPayment, findPaymentById, listPaymentsByInvoice, getTotalPaidForInvoice } from './paymentRepo'
import { prisma } from '@/common/infrastructure/db'
import { InvoiceStatus } from '@/prisma/client'

describe('Sales Context: Payment Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  beforeEach(async () => {
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
      data: { id, username }
    })
  }

  const createTestCustomer = async (userId: string, name: string = 'Test Customer') => {
    return await prisma.customer.create({
      data: {
        userId,
        name,
        balance: 0,
      }
    })
  }

  const createTestInvoice = async (userId: string, customerId: string, total: number = 1000) => {
    const journalEntry = await prisma.journalEntry.create({
      data: {
        userId,
        entryNumber: `J-INV-${Date.now()}`,
        description: 'Test invoice journal entry',
        date: new Date(),
      }
    })

    return await prisma.salesInvoice.create({
      data: {
        userId,
        customerId,
        invoiceNumber: `INV-${Date.now()}`,
        total,
        date: new Date(),
        dueDate: new Date(Date.now() + 30 * 86400000),
        status: InvoiceStatus.Issued,
        journalEntryId: journalEntry.id,
      }
    })
  }

  const createTestJournalEntry = async (userId: string) => {
    return await prisma.journalEntry.create({
      data: {
        userId,
        entryNumber: `J-${Date.now()}`,
        description: 'Test entry',
        date: new Date(),
      }
    })
  }

  it('should create a payment with valid data', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice = await createTestInvoice(user.id, customer.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const paymentData = {
      invoiceId: invoice.id,
      amount: 500,
      date: new Date('2025-12-01'),
      method: 'Cash' as const,
      reference: 'REF123',
      journalEntryId: journalEntry.id,
    }

    const result = await createPayment(paymentData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const payment = result.value
      expect(payment.invoiceId).toBe(invoice.id)
      expect(payment.amount).toBe(500)
      expect(payment.method).toBe('Cash')
      expect(payment.reference).toBe('REF123')
      expect(payment.journalEntryId).toBe(journalEntry.id)
      expect(payment.id).toBeDefined()
      expect(payment.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    const dbPayment = await prisma.payment.findFirst({ where: { invoiceId: invoice.id } })
    expect(dbPayment).not.toBeNull()
    expect(Number(dbPayment?.amount)).toBe(500)
  })

  it('should create a payment without reference', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice = await createTestInvoice(user.id, customer.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const paymentData = {
      invoiceId: invoice.id,
      amount: 300,
      date: new Date('2025-12-02'),
      method: 'BankTransfer' as const,
      journalEntryId: journalEntry.id,
    }

    const result = await createPayment(paymentData)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.reference).toBeUndefined()
    }
  })

  it('should find a payment by ID', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice = await createTestInvoice(user.id, customer.id)
    const journalEntry = await createTestJournalEntry(user.id)

    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: 200,
        date: new Date('2025-12-03'),
        method: 'CreditCard',
        journalEntryId: journalEntry.id,
      }
    })

    const result = await findPaymentById(user.id, payment.id)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value?.id).toBe(payment.id)
      expect(result.value?.amount).toBe(200)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a payment belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const customerA = await createTestCustomer(userA.id)
    const invoiceA = await createTestInvoice(userA.id, customerA.id)
    const journalEntryA = await createTestJournalEntry(userA.id)

    const payment = await prisma.payment.create({
      data: {
        invoiceId: invoiceA.id,
        amount: 200,
        date: new Date('2025-12-04'),
        method: 'Cash',
        journalEntryId: journalEntryA.id,
      }
    })

    const result = await findPaymentById(userB.id, payment.id)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list payments for an invoice', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice1 = await createTestInvoice(user.id, customer.id, 1000)
    const invoice2 = await createTestInvoice(user.id, customer.id, 2000)
    const journalEntry1 = await createTestJournalEntry(user.id)
    const journalEntry2 = await createTestJournalEntry(user.id)
    const journalEntry3 = await createTestJournalEntry(user.id)

    await prisma.payment.createMany({
      data: [
        {
          invoiceId: invoice1.id,
          amount: 300,
          date: new Date('2025-12-01'),
          method: 'Cash',
          journalEntryId: journalEntry1.id,
        },
        {
          invoiceId: invoice1.id,
          amount: 200,
          date: new Date('2025-12-02'),
          method: 'BankTransfer',
          journalEntryId: journalEntry2.id,
        },
        {
          invoiceId: invoice2.id,
          amount: 500,
          date: new Date('2025-12-03'),
          method: 'CreditCard',
          journalEntryId: journalEntry3.id,
        },
      ]
    })

    const result = await listPaymentsByInvoice(user.id, invoice1.id)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value).toHaveLength(2)
      const amounts = result.value.map(p => p.amount)
      expect(amounts).toContain(300)
      expect(amounts).toContain(200)
      expect(result.value[0].date.getTime()).toBeLessThanOrEqual(result.value[1].date.getTime())
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should calculate total paid for an invoice', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice = await createTestInvoice(user.id, customer.id, 1500)
    const journalEntry1 = await createTestJournalEntry(user.id)
    const journalEntry2 = await createTestJournalEntry(user.id)

    await prisma.payment.createMany({
      data: [
        {
          invoiceId: invoice.id,
          amount: 400,
          date: new Date('2025-12-01'),
          method: 'Cash',
          journalEntryId: journalEntry1.id,
        },
        {
          invoiceId: invoice.id,
          amount: 600,
          date: new Date('2025-12-02'),
          method: 'BankTransfer',
          journalEntryId: journalEntry2.id,
        },
      ]
    })

    const result = await getTotalPaidForInvoice(user.id, invoice.id)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value).toBe(1000)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should return zero total if no payments', async () => {
    const user = await createTestUser()
    const customer = await createTestCustomer(user.id)
    const invoice = await createTestInvoice(user.id, customer.id)

    const result = await getTotalPaidForInvoice(user.id, invoice.id)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value).toBe(0)
    } else {
      expect.fail('Expected success but got failure')
    }
  })
})