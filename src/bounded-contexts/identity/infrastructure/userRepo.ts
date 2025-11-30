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

    return Failure(InfrastructureFailure('DatabaseError', e.message || 'Unknown DB error', e))
  }
}


export const createUser = (username: string): Promise<Result<User>> => {
  const action = prisma.user.create({ 
    data: { username } 
  })

  return safeDbCall(action)
}