import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createCustomer, findCustomerById, listCustomers, updateCustomerBalance } from './customerRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Sales Context: Customer Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up before each test
  beforeEach(async () => {
    // Delete sales-related tables in correct order (due to foreign keys)
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

  it('should create a customer with valid data', async () => {
    const user = await createTestUser()
    const customerData = {
      userId: user.id,
      name: 'Acme Corporation',
      email: 'contact@acme.example',
    }

    const result = await createCustomer(customerData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const customer = result.value
      expect(customer.userId).toBe(user.id)
      expect(customer.name).toBe('Acme Corporation')
      expect(customer.email).toBe('contact@acme.example')
      expect(customer.balance).toBe(0)
      expect(customer.id).toBeDefined()
      expect(customer.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbCustomer = await prisma.customer.findFirst({ where: { userId: user.id } })
    expect(dbCustomer).not.toBeNull()
    expect(dbCustomer?.name).toBe('Acme Corporation')
  })

  it('should create a customer without email', async () => {
    const user = await createTestUser()
    const customerData = {
      userId: user.id,
      name: 'John Doe',
    }

    const result = await createCustomer(customerData)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.email).toBeUndefined()
    }
  })

  it('should find a customer by ID', async () => {
    const user = await createTestUser()
    const customerData = {
      userId: user.id,
      name: 'Test Customer',
    }
    const createResult = await createCustomer(customerData)
    expect(createResult.isSuccess).toBe(true)
    const createdCustomer = createResult.isSuccess ? createResult.value : null
    expect(createdCustomer).not.toBeNull()

    const findResult = await findCustomerById(user.id, createdCustomer!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdCustomer!.id)
      expect(findResult.value?.name).toBe('Test Customer')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a customer belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const customerData = {
      userId: userA.id,
      name: 'Customer A',
    }
    const createResult = await createCustomer(customerData)
    expect(createResult.isSuccess).toBe(true)
    const createdCustomer = createResult.isSuccess ? createResult.value : null
    expect(createdCustomer).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findCustomerById(userB.id, createdCustomer!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the customer belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list customers for a user', async () => {
    const user = await createTestUser()
    const customers = [
      { userId: user.id, name: 'Customer One' },
      { userId: user.id, name: 'Customer Two', email: 'two@example.com' },
    ]
    for (const cust of customers) {
      const result = await createCustomer(cust)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listCustomers(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const names = listResult.value.map(c => c.name)
      expect(names).toContain('Customer One')
      expect(names).toContain('Customer Two')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should update customer balance', async () => {
    const user = await createTestUser()
    const customerData = {
      userId: user.id,
      name: 'Balance Customer',
    }
    const createResult = await createCustomer(customerData)
    expect(createResult.isSuccess).toBe(true)
    const createdCustomer = createResult.isSuccess ? createResult.value : null
    expect(createdCustomer).not.toBeNull()

    // Increase balance by 100
    const updateResult = await updateCustomerBalance(user.id, createdCustomer!.id!, 100)
    expect(updateResult.isSuccess).toBe(true)
    if (updateResult.isSuccess) {
      expect(updateResult.value.balance).toBe(100)
    }

    // Decrease balance by 30
    const updateResult2 = await updateCustomerBalance(user.id, createdCustomer!.id!, -30)
    expect(updateResult2.isSuccess).toBe(true)
    if (updateResult2.isSuccess) {
      expect(updateResult2.value.balance).toBe(70)
    }

    // Verify in database
    const dbCustomer = await prisma.customer.findUnique({ where: { id: createdCustomer!.id! } })
    expect(dbCustomer).not.toBeNull()
    expect(Number(dbCustomer!.balance)).toBe(70)
  })
})