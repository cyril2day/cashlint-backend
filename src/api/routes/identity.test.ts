import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest'
import request from 'supertest'
import { app } from '@/api/server'
import { prisma } from '@/common/infrastructure/db'

describe('Identity Context: API Routes (Integration)', () => {
  beforeAll(async () => {
    await prisma.$connect()
  })
  
  // Clean up the database before every test to ensure isolation
  beforeEach(async () => {
    await prisma.session.deleteMany() // Delete children first (FK constraint)
    await prisma.user.deleteMany()
  })

  // Disconnect after all tests are done
  afterAll(async () => {
    await prisma.$disconnect()
  })

  describe('POST /api/users', () => {
    it('should create a user with valid username', async () => {
      expect.assertions(4)

      const username = 'test_user_123'
      
      const response = await request(app)
        .post('/api/users')
        .send({ username })
        .expect(201)

      expect(response.body.user.username).toBe(username)
      expect(response.body.user.id).toBeDefined()
      expect(response.body.message).toBe('User created successfully')

      // Verify in database
      const dbUser = await prisma.user.findUnique({ where: { username } })
      expect(dbUser).not.toBeNull()
    })

    it('should normalize uppercase username to lowercase', async () => {
      expect.assertions(1)

      const inputUsername = 'Test_User_Upper'
      const expectedUsername = 'test_user_upper'
      
      const response = await request(app)
        .post('/api/users')
        .send({ username: inputUsername })
        .expect(201)

      expect(response.body.user.username).toBe(expectedUsername)
    })

    it('should reject missing username', async () => {
      expect.assertions(2)

      const response = await request(app)
        .post('/api/users')
        .send({})
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.message).toMatch(/Username is required/)
    })

    it('should reject non-string username', async () => {
      expect.assertions(2)

      const response = await request(app)
        .post('/api/users')
        .send({ username: 123 })
        .expect(400)

      expect(response.body.error.type).toBe('ApplicationFailure')
      expect(response.body.error.message).toMatch(/Username is required/)
    })

    it('should reject usernames shorter than 3 characters', async () => {
      expect.assertions(2)

      const invalidUsername = 'ab'
      
      const response = await request(app)
        .post('/api/users')
        .send({ username: invalidUsername })
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.message).toMatch(/at least 3 characters/)
    })

    it('should reject usernames with spaces', async () => {
      expect.assertions(2)

      const invalidUsername = 'space user'
      
      const response = await request(app)
        .post('/api/users')
        .send({ username: invalidUsername })
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
      expect(response.body.error.message).toMatch(/alphanumeric and underscores only/)
    })

    it('should reject non-alphanumeric characters (symbols)', async () => {
      expect.assertions(1)

      const invalidUsername = 'user@name'
      
      const response = await request(app)
        .post('/api/users')
        .send({ username: invalidUsername })
        .expect(400)

      expect(response.body.error.type).toBe('DomainFailure')
    })

    it('should return 409 when trying to create a duplicate username', async () => {
      expect.assertions(2)

      const username = 'duplicate_user'

      // Create first user
      await request(app)
        .post('/api/users')
        .send({ username })
        .expect(201)

      // Try to create duplicate
      const response = await request(app)
        .post('/api/users')
        .send({ username })
        .expect(409)

      expect(response.body.error.type).toBe('InfrastructureFailure')
      expect(response.body.error.subtype).toBe('DuplicateKey')
    })
  })

  describe('GET /api/users/health', () => {
    it('should return health status', async () => {
      expect.assertions(3)

      const response = await request(app)
        .get('/api/users/health')
        .expect(200)

      expect(response.body.status).toBe('ok')
      expect(response.body.context).toBe('identity')
      expect(response.body.timestamp).toBeDefined()
    })
  })
})