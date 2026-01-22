import { Request, Response, NextFunction } from 'express'
import { findSessionById } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { isSessionExpired } from '@/bounded-contexts/identity/domain/session'
import { sendErrorResponse } from './errorMapper'
import { sessionIdToResult } from './requestStrategies'
import { pipe } from '@/shared/fp-utils'
import { ifElse } from 'pristine-fp'
import { andThenAsync, andThen, fold, Success, Failure } from '@/common/types/result'
import type { Session } from '@/prisma/client'

/**
 * Combined authentication middleware that accepts either a bearer token
 * (Authorization header) or a session cookie.
 * If authentication succeeds, attaches session and userId to res.locals.
 * Otherwise sends an appropriate error response.
 */

const sessionExpiredError = {
  type: 'DomainFailure' as const,
  subtype: 'SessionExpired' as const,
  message: 'Session has expired'
} as const

const rejectExpiredSession = (session: Session) =>
  ifElse(
    () => isSessionExpired(session),
    () => Failure(sessionExpiredError),
    () => Success(session)
  )

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authResult = await pipe(
    sessionIdToResult,
    andThenAsync(findSessionById),
    andThen(rejectExpiredSession)
  )(req)

  fold<Session, void>(
    (error) => sendErrorResponse(res, error),
    (session) => {
      res.locals.session = session
      res.locals.userId = session.userId
      next()
    }
  )(authResult)
}