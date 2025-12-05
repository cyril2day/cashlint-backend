import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createAccount, findAccountById, findAccountByCode, listAccounts } from './accountRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Ledger Context: Account Repository (Infrastructure)', () => {
  beforeEach(async () => {
    // Clear all dependent tables in correct order due to foreign keys
    await prisma.payment.deleteMany()
    await prisma.salesInvoice.deleteMany()
    await prisma.cashSale.deleteMany()
    await prisma.customerDeposit.deleteMany()
    await prisma.customer.deleteMany()
    await prisma.journalLine.deleteMany()
    await prisma.journalEntry.deleteMany()
    await prisma.account.deleteMany()
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()

    // Create test users for this test
    await prisma.user.create({
      data: {
        id: 'test-user-123',
        username: 'testuser123',
      },
    })
    await prisma.user.create({
      data: {
        id: 'another-user-456',
        username: 'anotheruser456',
      },
    })
  })

  afterAll(async () => {
    // Clean up test users and their related data in correct order
    await prisma.payment.deleteMany({
      where: {
        invoice: {
          user: {
            id: { in: ['test-user-123', 'another-user-456'] },
          },
        },
      },
    })
    await prisma.salesInvoice.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.cashSale.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.customerDeposit.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.customer.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.journalLine.deleteMany({
      where: {
        journalEntry: {
          user: {
            id: { in: ['test-user-123', 'another-user-456'] },
          },
        },
      },
    })
    await prisma.journalEntry.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.account.deleteMany({
      where: {
        user: {
          id: { in: ['test-user-123', 'another-user-456'] },
        },
      },
    })
    await prisma.user.deleteMany({
      where: {
        id: { in: ['test-user-123', 'another-user-456'] },
      },
    })
    await prisma.$disconnect()
  })

  const userId = 'test-user-123'
  const anotherUserId = 'another-user-456'

  it('should persist a valid account', async () => {
    const accountData = {
      userId,
      code: '101',
      name: 'Cash',
      type: 'Asset' as const,
      normalBalance: 'Debit' as const,
    }

    const result = await createAccount(accountData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const account = result.value
      expect(account.userId).toBe(userId)
      expect(account.code).toBe('101')
      expect(account.name).toBe('Cash')
      expect(account.type).toBe('Asset')
      expect(account.normalBalance).toBe('Debit')
      expect(account.id).toBeDefined()
    } else {
      // If we get here, the test should fail
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbAccount = await prisma.account.findFirst({ where: { userId, code: '101' } })
    expect(dbAccount).not.toBeNull()
  })

  it('should find an account by ID', async () => {
    // First create an account
    const accountData = {
      userId,
      code: '201',
      name: 'Accounts Payable',
      type: 'Liability' as const,
      normalBalance: 'Credit' as const,
    }
    const createResult = await createAccount(accountData)
    expect(createResult.isSuccess).toBe(true)
    const createdAccount = createResult.isSuccess ? createResult.value : null
    expect(createdAccount).not.toBeNull()

    const findResult = await findAccountById(userId, createdAccount!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdAccount!.id)
      expect(findResult.value?.code).toBe('201')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find an account belonging to another user', async () => {
    // Create an account for user A
    const accountData = {
      userId,
      code: '301',
      name: 'Owner Capital',
      type: 'Equity' as const,
      normalBalance: 'Credit' as const,
    }
    const createResult = await createAccount(accountData)
    expect(createResult.isSuccess).toBe(true)
    const createdAccount = createResult.isSuccess ? createResult.value : null
    expect(createdAccount).not.toBeNull()

    // Try to find with a different user ID
    const findResult = await findAccountById(anotherUserId, createdAccount!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the account belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should find an account by code for the same user', async () => {
    const accountData = {
      userId,
      code: '401',
      name: 'Service Revenue',
      type: 'Revenue' as const,
      normalBalance: 'Credit' as const,
    }
    const createResult = await createAccount(accountData)
    if (!createResult.isSuccess) {
      console.error('createResult error:', createResult.error)
    }
    expect(createResult.isSuccess).toBe(true)

    const findResult = await findAccountByCode(userId, '401')
    if (!findResult.isSuccess) {
      console.error('findResult error:', findResult.error)
    }
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value).not.toBeNull()
      expect(findResult.value!.code).toBe('401')
      expect(findResult.value!.name).toBe('Service Revenue')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list accounts for a user', async () => {
    // Create a few accounts for the user
    const accounts = [
      { userId, code: '101', name: 'Cash', type: 'Asset' as const, normalBalance: 'Debit' as const },
      { userId, code: '201', name: 'Accounts Payable', type: 'Liability' as const, normalBalance: 'Credit' as const },
      { userId, code: '301', name: 'Owner Capital', type: 'Equity' as const, normalBalance: 'Credit' as const },
    ]
    for (const acc of accounts) {
      const result = await createAccount(acc)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listAccounts(userId)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(3)
      const codes = listResult.value.map(a => a.code)
      expect(codes).toContain('101')
      expect(codes).toContain('201')
      expect(codes).toContain('301')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not list accounts of another user', async () => {
    // Create one account for user A
    const createResult1 = await createAccount({
      userId,
      code: '101',
      name: 'Cash',
      type: 'Asset' as const,
      normalBalance: 'Debit' as const,
    })
    if (!createResult1.isSuccess) {
      console.error('createResult1 error:', createResult1.error)
    }
    expect(createResult1.isSuccess).toBe(true)
    // Create two accounts for user B
    const createResult2 = await createAccount({
      userId: anotherUserId,
      code: '201',
      name: 'Accounts Payable',
      type: 'Liability' as const,
      normalBalance: 'Credit' as const,
    })
    expect(createResult2.isSuccess).toBe(true)
    const createResult3 = await createAccount({
      userId: anotherUserId,
      code: '301',
      name: 'Owner Capital',
      type: 'Equity' as const,
      normalBalance: 'Credit' as const,
    })
    expect(createResult3.isSuccess).toBe(true)

    const listResult = await listAccounts(userId)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      // Only the account belonging to userId should be returned
      expect(listResult.value).toHaveLength(1)
      expect(listResult.value[0].code).toBe('101')
    } else {
      expect.fail('Expected success but got failure')
    }
  })
})