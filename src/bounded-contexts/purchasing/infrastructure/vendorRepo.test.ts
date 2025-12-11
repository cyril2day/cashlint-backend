import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createVendor, findVendorById, listVendors, updateVendorBalance } from './vendorRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Purchasing Context: Vendor Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  // Clean up before each test
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
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (id: string = 'test-user-123', username: string = 'testuser123') => {
    return await prisma.user.create({
      data: { id, username }
    })
  }

  it('should create a vendor with valid data', async () => {
    const user = await createTestUser()
    const vendorData = {
      userId: user.id,
      name: 'Acme Corporation',
      email: 'contact@acme.example',
    }

    const result = await createVendor(vendorData)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const vendor = result.value
      expect(vendor.userId).toBe(user.id)
      expect(vendor.name).toBe('Acme Corporation')
      expect(vendor.email).toBe('contact@acme.example')
      expect(vendor.balance).toBe(0)
      expect(vendor.id).toBeDefined()
      expect(vendor.createdAt).toBeInstanceOf(Date)
    } else {
      expect.fail('Expected success but got failure')
    }

    // Verify in database
    const dbVendor = await prisma.vendor.findFirst({ where: { userId: user.id } })
    expect(dbVendor).not.toBeNull()
    expect(dbVendor?.name).toBe('Acme Corporation')
  })

  it('should create a vendor without email', async () => {
    const user = await createTestUser()
    const vendorData = {
      userId: user.id,
      name: 'John Doe',
    }

    const result = await createVendor(vendorData)
    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      expect(result.value.email).toBeUndefined()
    }
  })

  it('should find a vendor by ID', async () => {
    const user = await createTestUser()
    const vendorData = {
      userId: user.id,
      name: 'Test Vendor',
    }
    const createResult = await createVendor(vendorData)
    expect(createResult.isSuccess).toBe(true)
    const createdVendor = createResult.isSuccess ? createResult.value : null
    expect(createdVendor).not.toBeNull()

    const findResult = await findVendorById(user.id, createdVendor!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value?.id).toBe(createdVendor!.id)
      expect(findResult.value?.name).toBe('Test Vendor')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should not find a vendor belonging to another user', async () => {
    const userA = await createTestUser('user-a', 'usera')
    const userB = await createTestUser('user-b', 'userb')
    const vendorData = {
      userId: userA.id,
      name: 'Vendor A',
    }
    const createResult = await createVendor(vendorData)
    expect(createResult.isSuccess).toBe(true)
    const createdVendor = createResult.isSuccess ? createResult.value : null
    expect(createdVendor).not.toBeNull()

    // Try to find with user B's ID
    const findResult = await findVendorById(userB.id, createdVendor!.id!)
    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      // Should return null because the vendor belongs to another user
      expect(findResult.value).toBeNull()
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should list vendors for a user', async () => {
    const user = await createTestUser()
    const vendors = [
      { userId: user.id, name: 'Vendor One' },
      { userId: user.id, name: 'Vendor Two', email: 'two@example.com' },
    ]
    for (const vendor of vendors) {
      const result = await createVendor(vendor)
      expect(result.isSuccess).toBe(true)
    }

    const listResult = await listVendors(user.id)
    expect(listResult.isSuccess).toBe(true)
    if (listResult.isSuccess) {
      expect(listResult.value).toHaveLength(2)
      const names = listResult.value.map(c => c.name)
      expect(names).toContain('Vendor One')
      expect(names).toContain('Vendor Two')
    } else {
      expect.fail('Expected success but got failure')
    }
  })

  it('should update vendor balance', async () => {
    const user = await createTestUser()
    const vendorData = {
      userId: user.id,
      name: 'Balance Vendor',
    }
    const createResult = await createVendor(vendorData)
    expect(createResult.isSuccess).toBe(true)
    const createdVendor = createResult.isSuccess ? createResult.value : null
    expect(createdVendor).not.toBeNull()

    // Increase balance by 100
    const updateResult = await updateVendorBalance(user.id, createdVendor!.id!, 100)
    expect(updateResult.isSuccess).toBe(true)
    if (updateResult.isSuccess) {
      expect(updateResult.value.balance).toBe(100)
    }

    // Decrease balance by 30
    const updateResult2 = await updateVendorBalance(user.id, createdVendor!.id!, -30)
    expect(updateResult2.isSuccess).toBe(true)
    if (updateResult2.isSuccess) {
      expect(updateResult2.value.balance).toBe(70)
    }

    // Verify in database
    const dbVendor = await prisma.vendor.findUnique({ where: { id: createdVendor!.id! } })
    expect(dbVendor).not.toBeNull()
    expect(Number(dbVendor!.balance)).toBe(70)
  })
})