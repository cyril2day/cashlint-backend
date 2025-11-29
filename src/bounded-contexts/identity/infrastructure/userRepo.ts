import { prisma } from '@/common/infrastructure/db' 
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma, User } from '@/prisma/client'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return Failure(InfrastructureFailure('DuplicateKey', 'Username already exists'))
    }

    // Generic DB failure
    return Failure(InfrastructureFailure('DatabaseError', e.message || 'Unknown DB error', e))
  }
}


/**
 * Persists a new user to the database. This is an ACTION (Impure).
 */
export const createUser = (username: string): Promise<Result<User>> => {
  // 1. Define the Action (Prisma Promise)
  const action = prisma.user.create({ 
    data: { username } 
  })

  // 2. Execute safely using the functional wrapper
  return safeDbCall(action)
}