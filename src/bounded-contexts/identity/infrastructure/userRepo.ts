import { prisma } from '@/common/infrastructure/db' 
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma, User } from '@/prisma/client'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return Failure(InfrastructureFailure('DuplicateKey', 'Username already exists'))
    }

    // Use Option to safely extract error message
    const errorMessage = getOrElse('Unknown DB error')(fromNullable(e?.message))
    return Failure(InfrastructureFailure('DatabaseError', errorMessage, e))
  }
}


export const createUser = (username: string): Promise<Result<User>> => {
  const action = prisma.user.create({ 
    data: { username } 
  })

  return safeDbCall(action)
}