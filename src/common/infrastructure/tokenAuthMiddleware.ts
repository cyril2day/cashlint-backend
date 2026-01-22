import { Request, Response, NextFunction } from 'express'
import { findSessionById } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { isSessionExpired } from '@/bounded-contexts/identity/domain/session'
import type { Session } from '@/bounded-contexts/identity/domain/session'
import { sendErrorResponse } from './errorMapper'
import { fold, andThenAsync, andThen, fromNullable, Success, Failure, type Result } from '@/common/types/result'
import { ifElse } from 'pristine-fp'
import { extractBearerToken } from './requestStrategies'

// ---------- Helper: create a Result from a nullable token ----------
const tokenToResult = (token: string | undefined): Result<string> =>
  fromNullable<string>({
    type: 'ApplicationFailure' as const,
    subtype: 'MissingToken' as const,
    message: 'Authorization header with Bearer token is required'
  })(token)

// ---------- Helper: validate session expiration ----------
const validateSessionExpiry = (session: Session): Result<Session> =>
  ifElse(
    () => isSessionExpired(session),
    () => Failure({
      type: 'DomainFailure' as const,
      subtype: 'SessionExpired' as const,
      message: 'Token has expired'
    } as const),
    () => Success(session)
  )

// ---------- Main middleware ----------
export const requireTokenAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = extractBearerToken(req)

  // Convert token to Result<string>
  const tokenResult = tokenToResult(token)

  // Chain async session lookup
  const sessionResult = await andThenAsync(findSessionById)(tokenResult)

  // Validate expiry synchronously
  const validatedResult = andThen(validateSessionExpiry)(sessionResult)

  // Handle success/failure
  fold(
    (error) => sendErrorResponse(res, error),
    (session: Session) => {
      res.locals.session = session
      res.locals.userId = session.userId
      next()
    }
  )(validatedResult)
}

// Re‑export for backward compatibility
export { extractBearerToken }