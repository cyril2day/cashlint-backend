import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { InvalidSession, SessionExpired } from './errors'
import { gt, ifElse } from 'pristine-fp'
import { pipe } from '@/shared/fp-utils'
import { andThen } from '@/common/types/result'

// Re-export the Prisma Session type for convenience
import type { Session as PrismaSession } from '@/prisma/client'
export type Session = PrismaSession

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000

// --- Pure Calculations ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates that a string is a valid UUID v4.
 * Returns a Result<string> with the normalized UUID or Failure.
 */
export const validateSessionId = (id: string): Result<string> =>
  ifElse(
    () => UUID_REGEX.test(id),
    () => Success(id.toLowerCase()),
    () => Failure(InvalidSession('Session ID must be a valid UUID v4'))
  )

/**
 * Checks whether a session is expired based on its expiresAt field.
 */
export const isSessionExpired = (session: Session): boolean =>
  gt(Date.now())(session.expiresAt.getTime())

/**
 * Validate a session: check ID format and expiration.
 * Returns Success(session) if valid, otherwise Failure.
 */
export const validateSession = (session: Session): Result<Session> =>
  andThen((validatedId: string) =>
    ifElse(
      () => isSessionExpired(session),
      () => Failure(SessionExpired()),
      () => Success(session)
    )
  )(validateSessionId(session.id))

/**
 * Create a new session object (pure). Does not persist.
 * If expiresInMs is not provided, defaults to one year.
 */
export const createNewSession = (
  userId: string,
  expiresInMs: number = ONE_YEAR_MS
): Session => {
  const id = crypto.randomUUID() // browser/node: available in Node >= 19
  const expiresAt = new Date(Date.now() + expiresInMs)
  return { id, userId, expiresAt }
}