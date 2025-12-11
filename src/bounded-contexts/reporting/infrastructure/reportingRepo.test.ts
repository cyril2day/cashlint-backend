import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  getAccountsWithCumulativeBalances,
  getAccountsWithPeriodBalances,
  getCashJournalLines,
  findCashAccount,
} from './reportingRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Reporting Context: Reporting Repository (Infrastructure)', () => {
  const userId = 'test-user-reporting'
  const anotherUserId = 'another-user-reporting'
  let cashAccountId: string
  let revenueAccountId: string
  let expenseAccountId: string

  beforeEach(async () => {
    // Delete in correct order, respecting foreign keys
    // 0. Period (depends on User, but must be deleted before User due to foreign key)
    await prisma.period.deleteMany()
    // 1. Child tables of JournalEntry (that are not already in purchasing)
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    // 2. Purchasing child tables of JournalEntry
    await prisma.loanPayment.deleteMany()
    await prisma.vendorBill.deleteMany()
    await prisma.cashExpense.deleteMany()
    // 3. Other child tables
    await prisma.loan.deleteMany()
    await prisma.vendor.deleteMany()
    await prisma.customer.deleteMany()
    // 4. JournalLine (depends on JournalEntry and Account)
    await prisma.journalLine.deleteMany()
    // 5. JournalEntry (depends on User)
    await prisma.journalEntry.deleteMany()
    // 6. Account (depends on User)
    await prisma.account.deleteMany()
    // 7. Session (depends on User)
    await prisma.session.deleteMany()
    // 8. User
    await prisma.user.deleteMany()

    // Create test users
    await prisma.user.create({
      data: {
        id: userId,
        username: 'testuser_reporting',
      },
    })
    await prisma.user.create({
      data: {
        id: anotherUserId,
        username: 'anotheruser_reporting',
      },
    })

    // Create default accounts for the user
    const cashAccount = await prisma.account.create({
      data: {
        userId,
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit',
      },
    })
    cashAccountId = cashAccount.id

    const revenueAccount = await prisma.account.create({
      data: {
        userId,
        code: '401',
        name: 'Service Revenue',
        type: 'Revenue',
        normalBalance: 'Credit',
      },
    })
    revenueAccountId = revenueAccount.id

    const expenseAccount = await prisma.account.create({
      data: {
        userId,
        code: '501',
        name: 'Rent Expense',
        type: 'Expense',
        normalBalance: 'Debit',
      },
    })
    expenseAccountId = expenseAccount.id

    // Create a journal entry on 2025-06-01: debit Cash 1000, credit Revenue 1000
    await prisma.journalEntry.create({
      data: {
        userId,
        description: 'Sale',
        date: new Date('2025-06-01'),
        lines: {
          create: [
            { accountId: cashAccountId, amount: 1000, side: 'Debit' },
            { accountId: revenueAccountId, amount: 1000, side: 'Credit' },
          ],
        },
      },
    })

    // Create another journal entry on 2025-07-15: debit Expense 300, credit Cash 300
    await prisma.journalEntry.create({
      data: {
        userId,
        description: 'Pay rent',
        date: new Date('2025-07-15'),
        lines: {
          create: [
            { accountId: expenseAccountId, amount: 300, side: 'Debit' },
            { accountId: cashAccountId, amount: 300, side: 'Credit' },
          ],
        },
      },
    })

    // Create a journal entry for another user (should not appear in results)
    const otherCashAccount = await prisma.account.create({
      data: {
        userId: anotherUserId,
        code: '101',
        name: 'Cash',
        type: 'Asset',
        normalBalance: 'Debit',
      },
    })
    await prisma.journalEntry.create({
      data: {
        userId: anotherUserId,
        description: 'Other user sale',
        date: new Date('2025-06-01'),
        lines: {
          create: [
            { accountId: otherCashAccount.id, amount: 500, side: 'Debit' },
            {
              accountId: (await prisma.account.create({
                data: {
                  userId: anotherUserId,
                  code: '401',
                  name: 'Revenue',
                  type: 'Revenue',
                  normalBalance: 'Credit',
                },
              })).id,
              amount: 500,
              side: 'Credit',
            },
          ],
        },
      },
    })
  })

  afterAll(async () => {
    // Clean up test users and their related data
    // First delete periods
    await prisma.period.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.payment.deleteMany({
      where: {
        invoice: {
          user: {
            id: { in: [userId, anotherUserId] },
          },
        },
      },
    })
    await prisma.salesInvoice.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.cashSale.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.customerDeposit.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.customer.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.journalLine.deleteMany({
      where: {
        journalEntry: {
          user: {
            id: { in: [userId, anotherUserId] },
          },
        },
      },
    })
    await prisma.journalEntry.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.account.deleteMany({
      where: {
        user: {
          id: { in: [userId, anotherUserId] },
        },
      },
    })
    await prisma.user.deleteMany({
      where: {
        id: { in: [userId, anotherUserId] },
      },
    })
    await prisma.$disconnect()
  })

  describe('getAccountsWithCumulativeBalances', () => {
    it('returns accounts with balances up to a date', async () => {
      // As of 2025-06-30, only the first entry (June 1) should be included.
      const result = await getAccountsWithCumulativeBalances(
        userId,
        new Date('2025-06-30')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const accounts = result.value
      expect(accounts).toHaveLength(3) // Cash, Revenue, Expense

      const cash = accounts.find((a) => a.code === '101')
      const revenue = accounts.find((a) => a.code === '401')
      const expense = accounts.find((a) => a.code === '501')

      // Cash: debit 1000 (no credit yet) -> balance +1000
      expect(cash?.balance).toBe(1000)
      // Revenue: credit 1000 -> balance +1000 (credit normal balance)
      expect(revenue?.balance).toBe(1000)
      // Expense: no entries yet -> balance 0
      expect(expense?.balance).toBe(0)
    })

    it('returns accounts with balances up to a later date', async () => {
      // As of 2025-12-31, both entries are included.
      const result = await getAccountsWithCumulativeBalances(
        userId,
        new Date('2025-12-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const accounts = result.value
      const cash = accounts.find((a) => a.code === '101')
      const revenue = accounts.find((a) => a.code === '401')
      const expense = accounts.find((a) => a.code === '501')

      // Cash: debit 1000, credit 300 -> net +700
      expect(cash?.balance).toBe(700)
      // Revenue: credit 1000 -> +1000
      expect(revenue?.balance).toBe(1000)
      // Expense: debit 300 -> +300 (debit normal balance)
      expect(expense?.balance).toBe(300)
    })

    it('respects user isolation', async () => {
      const result = await getAccountsWithCumulativeBalances(
        anotherUserId,
        new Date('2025-12-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      // The other user has two accounts (Cash and Revenue) but no Expense
      const accounts = result.value
      expect(accounts).toHaveLength(2)
      const cash = accounts.find((a) => a.code === '101')
      const revenue = accounts.find((a) => a.code === '401')
      expect(cash?.balance).toBe(500)
      expect(revenue?.balance).toBe(500)
    })
  })

  describe('getAccountsWithPeriodBalances', () => {
    it('returns period‑specific balances (change during the date range)', async () => {
      // Period: 2025-07-01 to 2025-07-31 (only the second entry)
      const result = await getAccountsWithPeriodBalances(
        userId,
        new Date('2025-07-01'),
        new Date('2025-07-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const accounts = result.value
      const cash = accounts.find((a) => a.code === '101')
      const revenue = accounts.find((a) => a.code === '401')
      const expense = accounts.find((a) => a.code === '501')

      // Cash: credit 300 (decrease) -> balance -300
      expect(cash?.balance).toBe(-300)
      // Revenue: no change in this period -> 0
      expect(revenue?.balance).toBe(0)
      // Expense: debit 300 -> +300
      expect(expense?.balance).toBe(300)
    })

    it('returns zero balances for period with no transactions', async () => {
      const result = await getAccountsWithPeriodBalances(
        userId,
        new Date('2025-08-01'),
        new Date('2025-08-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const accounts = result.value
      accounts.forEach((acc) => {
        expect(acc.balance).toBe(0)
      })
    })
  })

  describe('getCashJournalLines', () => {
    it('returns cash journal lines within date range', async () => {
      const result = await getCashJournalLines(
        userId,
        cashAccountId,
        new Date('2025-06-01'),
        new Date('2025-07-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const lines = result.value
      expect(lines).toHaveLength(2)
      // First line: debit 1000 on 2025-06-01
      expect(lines[0].amount).toBe(1000)
      expect(lines[0].side).toBe('Debit')
      // Second line: credit 300 on 2025-07-15
      expect(lines[1].amount).toBe(300)
      expect(lines[1].side).toBe('Credit')
    })

    it('returns empty array for range with no cash transactions', async () => {
      const result = await getCashJournalLines(
        userId,
        cashAccountId,
        new Date('2025-08-01'),
        new Date('2025-08-31')
      )
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      expect(result.value).toHaveLength(0)
    })

    it('fails gracefully if cash account does not exist', async () => {
      const result = await getCashJournalLines(
        userId,
        'non-existent-account-id',
        new Date('2025-01-01'),
        new Date('2025-12-31')
      )
      // Should still succeed but return empty array because no lines match
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return
      expect(result.value).toHaveLength(0)
    })
  })

  describe('findCashAccount', () => {
    it('returns the cash account for the user', async () => {
      const result = await findCashAccount(userId)
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      const account = result.value
      expect(account).not.toBeNull()
      expect(account!.code).toBe('101')
      expect(account!.name).toBe('Cash')
      expect(account!.type).toBe('Asset')
    })

    it('returns null if cash account does not exist', async () => {
      // Delete journal lines that reference the cash account
      await prisma.journalLine.deleteMany({
        where: { accountId: cashAccountId },
      })
      // Then delete the cash account
      await prisma.account.delete({ where: { id: cashAccountId } })

      const result = await findCashAccount(userId)
      expect(result.isSuccess).toBe(true)
      if (!result.isSuccess) return

      expect(result.value).toBeNull()
    })
  })
})