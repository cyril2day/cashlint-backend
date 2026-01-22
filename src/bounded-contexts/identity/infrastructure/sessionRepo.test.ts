import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import { createSession, findSessionById, deleteSession, deleteSessionsByUserId } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { prisma } from '@/common/infrastructure/db'

describe('Identity Context: Session Repository (Infrastructure)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })

  beforeEach(async () => {
    // Clean up all sessions and users (order matters)
    await prisma.session.deleteMany()
    await prisma.user.deleteMany()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const createTestUser = async (username: string = 'testuser') => {
    const user = await prisma.user.create({
      data: {
        id: `user-${Date.now()}-${Math.random()}`,
        username,
      }
    })
    return user.id
  }

  it('should create a session for a user', async () => {
    expect.assertions(5)
    const userId = await createTestUser()

    const result = await createSession(userId)

    expect(result.isSuccess).toBe(true)
    if (result.isSuccess) {
      const session = result.value
      expect(session.userId).toBe(userId)
      expect(session.id).toBeDefined()
      expect(session.expiresAt).toBeInstanceOf(Date)
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now())
    }
  })

  it('should find a session by ID', async () => {
    expect.assertions(4)
    const userId = await createTestUser()
    const createResult = await createSession(userId)
    expect(createResult.isSuccess).toBe(true)
    const session = createResult.isSuccess ? createResult.value : null

    const findResult = await findSessionById(session!.id)

    expect(findResult.isSuccess).toBe(true)
    if (findResult.isSuccess) {
      expect(findResult.value.id).toBe(session!.id)
      expect(findResult.value.userId).toBe(userId)
    }
  })

  it('should return SessionNotFound when session does not exist', async () => {
    expect.assertions(2)

    const findResult = await findSessionById('non-existent-session-id')

    expect(findResult.isSuccess).toBe(false)
    if (!findResult.isSuccess) {
      expect(findResult.error.subtype).toBe('SessionNotFound')
    }
  })

  it('should delete a session by ID', async () => {
    expect.assertions(4)
    const userId = await createTestUser()
    const createResult = await createSession(userId)
    expect(createResult.isSuccess).toBe(true)
    const session = createResult.isSuccess ? createResult.value : null

    const deleteResult = await deleteSession(session!.id)

    expect(deleteResult.isSuccess).toBe(true)
    // Verify session no longer exists
    const findResult = await findSessionById(session!.id)
    expect(findResult.isSuccess).toBe(false)
    if (!findResult.isSuccess) {
      expect(findResult.error.subtype).toBe('SessionNotFound')
    }
  })

  it('should treat missing session deletion as success (already deleted)', async () => {
    expect.assertions(1)

    const deleteResult = await deleteSession('non-existent-session-id')

    expect(deleteResult.isSuccess).toBe(true)
  })

  it('should delete all sessions for a user', async () => {
    expect.assertions(5)
    const userId = await createTestUser()
    // Create two sessions for same user
    const create1 = await createSession(userId)
    const create2 = await createSession(userId)
    expect(create1.isSuccess).toBe(true)
    expect(create2.isSuccess).toBe(true)
    const session1 = create1.isSuccess ? create1.value : null
    const session2 = create2.isSuccess ? create2.value : null

    const deleteResult = await deleteSessionsByUserId(userId)

    expect(deleteResult.isSuccess).toBe(true)
    // Verify both sessions are gone
    const find1 = await findSessionById(session1!.id)
    const find2 = await findSessionById(session2!.id)
    expect(find1.isSuccess).toBe(false)
    expect(find2.isSuccess).toBe(false)
  })

  it('should handle deleteSessionsByUserId when no sessions exist', async () => {
    expect.assertions(1)
    const userId = await createTestUser()

    const deleteResult = await deleteSessionsByUserId(userId)

    expect(deleteResult.isSuccess).toBe(true)
  })
})