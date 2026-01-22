import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure, type AppError } from '@/common/types/errors'
import { Prisma, Session } from '@/prisma/client'
import { fromNullable as fromNullableOption, getOrElse } from '@/common/types/option'
import { equals, safeProp, when, unless, ifElse } from 'pristine-fp'
import { allOf, pipe } from '@/shared/fp-utils'
import { andThen, orElse, map, fromNullable } from '@/common/types/result'
import { safePropOr } from '@/shared/fp-utils'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    return ifElse(
      () => e instanceof Prisma.PrismaClientKnownRequestError,
      () => {
        const code = safeProp(e, 'code')
        return ifElse(
          () => equals('P2002')(code),
          () => Failure(InfrastructureFailure('DuplicateKey', 'Session ID already exists')),
          () => Failure(InfrastructureFailure('DatabaseError', `Database error: ${safePropOr(e, 'message', 'Unknown DB error')}`, e))
        )
      },
      () => Failure(InfrastructureFailure('DatabaseError', safePropOr(e, 'message', 'Unknown DB error'), e))
    )
  }
}

/**
 * Create a new session for a user.
 * @param userId - The user ID
 * @param expiresAt - Expiration date (defaults to one year from now)
 */
export const createSession = (
  userId: string,
  expiresAt: Date = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
): Promise<Result<Session>> => {
  const action = prisma.session.create({
    data: {
      id: crypto.randomUUID(),
      userId,
      expiresAt,
    }
  })
  return safeDbCall(action)
}

/**
 * Find a session by its ID.
 */
export const findSessionById = (sessionId: string): Promise<Result<Session>> =>
  safeDbCall(
    prisma.session.findUnique({ where: { id: sessionId } })
  ).then(
    andThen(
      fromNullable(InfrastructureFailure('SessionNotFound', 'Session not found'))
    )
  )

/**
 * Delete a session by its ID.
 */
export const deleteSession = (sessionId: string): Promise<Result<void>> =>
  safeDbCall(
    prisma.session.delete({ where: { id: sessionId } })
  )
    .then(map(() => undefined))
    .then(orElse((error: AppError) => {
      if (error.type === 'InfrastructureFailure' && error.originalError?.code === 'P2025') {
        return Success(undefined)
      }
      return Failure(error)
    }))

/**
 * Delete all sessions for a user (logout from all devices).
 */
export const deleteSessionsByUserId = (userId: string): Promise<Result<void>> =>
  safeDbCall(prisma.session.deleteMany({ where: { userId } }))
    .then(map(() => undefined))