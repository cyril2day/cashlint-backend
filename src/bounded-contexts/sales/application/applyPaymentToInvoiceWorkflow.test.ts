import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { applyPaymentToInvoiceWorkflow, ApplyPaymentToInvoiceCommand } from './applyPaymentToInvoiceWorkflow'
import { createCustomerWorkflow } from './createCustomerWorkflow'
import { issueSalesInvoiceWorkflow } from './issueSalesInvoiceWorkflow'
import { createAccount } from '@/bounded-contexts/ledger/infrastructure/accountRepo'
import { prisma } from '@/common/infrastructure/db'
import { InvoiceStatus } from '@/prisma/client'

describe('Sales Context: Apply Payment to Invoice Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  beforeEach(async () => {
    // Delete in correct order, respecting foreign keys
    // Child tables first
    await prisma.period.deleteMany()
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.salesInvoice.deleteMany()
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
      data: { id, username }
    })
  }

  const createDefaultAccounts = async (userId: string) => {
    // Cash (101) and Accounts Receivable (111) are required for payment workflow
    // Also Service Revenue (401) is required for issuing invoices
    await createAccount({
      userId,
      code: '101',
      name: 'Cash',
      type: 'Asset',
      normalBalance: 'Debit',
    })
    await createAccount({
      userId,
      code: '111',
      name: 'Accounts Receivable',
      type: 'Asset',
      normalBalance: 'Debit',
    })
    await createAccount({
      userId,
      code: '401',
      name: 'Service Revenue',
      type: 'Revenue',
      normalBalance: 'Credit',
    })
  }

  it('should apply a full payment to an open invoice', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    // Create a customer
    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Test Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null
    expect(customer).not.toBeNull()

    // Issue an invoice
    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-001',
      total: 1000,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null
    expect(invoice).not.toBeNull()

    // Apply payment
    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 1000,
      date: '2025-01-16T00:00:00Z',
      method: 'BankTransfer',
      reference: 'PAY-001',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const payment = result.value
      expect(payment.invoiceId).toBe(invoice!.id)
      expect(payment.amount).toBe(1000)
      expect(payment.method).toBe('BankTransfer')
      expect(payment.reference).toBe('PAY-001')
      expect(payment.journalEntryId).toBeDefined()

      // Verify invoice status updated to Paid
      const updatedInvoice = await prisma.salesInvoice.findUnique({
        where: { id: invoice!.id! },
      })
      expect(updatedInvoice?.status).toBe(InvoiceStatus.Paid)

      // Verify customer balance decreased by payment amount
      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer!.id! },
      })
      expect(Number(updatedCustomer!.balance)).toBe(0) // Invoice increased by 1000, payment decreased by 1000

      // Verify journal entry exists and has correct lines
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: payment.journalEntryId },
        include: { lines: true },
      })
      expect(journalEntry).not.toBeNull()
      expect(journalEntry!.lines).toHaveLength(2)
      const cashLine = journalEntry!.lines.find(l => l.side === 'Debit')
      const arLine = journalEntry!.lines.find(l => l.side === 'Credit')
      expect(cashLine).toBeDefined()
      expect(arLine).toBeDefined()
      expect(Number(cashLine!.amount)).toBe(1000)
      expect(Number(arLine!.amount)).toBe(1000)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should apply a partial payment and set invoice to PartiallyPaid', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Partial Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-002',
      total: 1000,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null

    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 600,
      date: '2025-01-16T00:00:00Z',
      method: 'Cash',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const payment = result.value
      expect(payment.amount).toBe(600)

      const updatedInvoice = await prisma.salesInvoice.findUnique({
        where: { id: invoice!.id! },
      })
      expect(updatedInvoice?.status).toBe(InvoiceStatus.PartiallyPaid)

      const updatedCustomer = await prisma.customer.findUnique({
        where: { id: customer!.id! },
      })
      expect(Number(updatedCustomer!.balance)).toBe(400) // 1000 - 600

      // Verify total paid
      const totalPaid = await prisma.payment.aggregate({
        where: { invoiceId: invoice!.id! },
        _sum: { amount: true },
      })
      expect(Number(totalPaid._sum.amount)).toBe(600)
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should reject payment exceeding open amount', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Exceed Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-003',
      total: 500,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null

    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 600,
      date: '2025-01-16T00:00:00Z',
      method: 'BankTransfer',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PaymentExceedsOpenAmount')
    }
  })

  it('should reject payment with future date', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Future Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-004',
      total: 300,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null

    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 1)
    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 300,
      date: futureDate.toISOString(),
      method: 'CreditCard',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('PaymentDateInFuture')
    }
  })

  it('should reject payment with negative amount', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Negative Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-005',
      total: 300,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null

    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: -100,
      date: '2025-01-16T00:00:00Z',
      method: 'Cash',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvalidPaymentAmount')
    }
  })

  it('should reject payment if invoice not found', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: 'non-existent-invoice-id',
      amount: 100,
      date: '2025-01-16T00:00:00Z',
      method: 'Cash',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('InvoiceNotFound')
    }
  })

  it('should reject payment if default accounts missing', async () => {
    const user = await createTestUser()
    // Do NOT create default accounts

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'No Accounts Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    // Create an invoice without journal entry? Actually issueSalesInvoiceWorkflow will fail without accounts.
    // So we need to manually create an invoice with a journal entry.
    // Let's create a journal entry and invoice directly.
    const journalEntry = await prisma.journalEntry.create({
      data: {
        userId: user.id,
        entryNumber: 'J-001',
        description: 'Test invoice',
        date: new Date('2025-01-15'),
      },
    })
    const invoice = await prisma.salesInvoice.create({
      data: {
        userId: user.id,
        customerId: customer!.id!,
        invoiceNumber: 'INV-006',
        total: 200,
        date: new Date('2025-01-15'),
        status: InvoiceStatus.Issued,
        journalEntryId: journalEntry.id,
      },
    })

    const command: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice.id,
      amount: 200,
      date: '2025-01-16T00:00:00Z',
      method: 'Cash',
    }

    const result = await applyPaymentToInvoiceWorkflow(command)

    expect(result.isSuccess).toBe(false)
    if (!result.isSuccess) {
      expect(result.error.type).toBe('DomainFailure')
      expect(result.error.subtype).toBe('AccountNotFound')
    }
  })

  it('should allow multiple partial payments until fully paid', async () => {
    const user = await createTestUser()
    await createDefaultAccounts(user.id)

    const customerResult = await createCustomerWorkflow({
      userId: user.id,
      name: 'Multi Payment Customer',
    })
    expect(customerResult.isSuccess).toBe(true)
    const customer = customerResult.isSuccess ? customerResult.value : null

    const invoiceResult = await issueSalesInvoiceWorkflow({
      userId: user.id,
      customerId: customer!.id!,
      invoiceNumber: 'INV-007',
      total: 900,
      date: '2025-01-15T00:00:00Z',
    })
    expect(invoiceResult.isSuccess).toBe(true)
    const invoice = invoiceResult.isSuccess ? invoiceResult.value : null

    // First partial payment
    const command1: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 300,
      date: '2025-01-16T00:00:00Z',
      method: 'Cash',
    }
    const result1 = await applyPaymentToInvoiceWorkflow(command1)
    expect(result1.isSuccess).toBe(true)

    let updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id: invoice!.id! },
    })
    expect(updatedInvoice?.status).toBe(InvoiceStatus.PartiallyPaid)

    // Second partial payment
    const command2: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 400,
      date: '2025-01-17T00:00:00Z',
      method: 'BankTransfer',
    }
    const result2 = await applyPaymentToInvoiceWorkflow(command2)
    expect(result2.isSuccess).toBe(true)

    updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id: invoice!.id! },
    })
    expect(updatedInvoice?.status).toBe(InvoiceStatus.PartiallyPaid)

    // Third payment that makes it fully paid
    const command3: ApplyPaymentToInvoiceCommand = {
      userId: user.id,
      invoiceId: invoice!.id!,
      amount: 200,
      date: '2025-01-18T00:00:00Z',
      method: 'CreditCard',
    }
    const result3 = await applyPaymentToInvoiceWorkflow(command3)
    expect(result3.isSuccess).toBe(true)

    updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id: invoice!.id! },
    })
    expect(updatedInvoice?.status).toBe(InvoiceStatus.Paid)

    const totalPaid = await prisma.payment.aggregate({
      where: { invoiceId: invoice!.id! },
      _sum: { amount: true },
    })
    expect(Number(totalPaid._sum.amount)).toBe(900)

    const updatedCustomer = await prisma.customer.findUnique({
      where: { id: customer!.id! },
    })
    expect(Number(updatedCustomer!.balance)).toBe(0)
  })
})