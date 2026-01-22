import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { logoutWorkflow } from '@/bounded-contexts/identity/application/logoutWorkflow'
import { prisma } from '@/common/infrastructure/db'

describe('Identity Context: Logout Workflow (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  // Must delete in correct order to respect foreign key constraints
  beforeEach(async () => {
    await prisma.loanPayment.deleteMany()
    await prisma.cashExpense.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.period.deleteMany()
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('should delete an existing session', async () => {
    expect.assertions(3)

    // Create user and session
    const user = await prisma.user.create({
      data: {
        id: `user-${Date.now()}`,
        username: 'testuser',
      }
    })
    const session = await prisma.session.create({
      data: {
        id: `session-${Date.now()}`,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }
    })
    expect(session).not.toBeNull()

    const result = await logoutWorkflow(session.id)

    expect(result.isSuccess).toBe(true)
    // Verify session is gone
    const dbSession = await prisma.session.findUnique({ where: { id: session.id } })
    expect(dbSession).toBeNull()
  })

  it('should succeed when session does not exist (already logged out)', async () => {
    expect.assertions(1)

    const result = await logoutWorkflow('non-existent-session-id')

    expect(result.isSuccess).toBe(true)
  })
})