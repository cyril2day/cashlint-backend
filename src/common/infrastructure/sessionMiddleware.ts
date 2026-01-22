import { Request, Response, NextFunction } from 'express'
import { findSessionById } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { isSessionExpired } from '@/bounded-contexts/identity/domain/session'
import { sendErrorResponse } from './errorMapper'
import { Result } from '@/common/types/result'

/**
 * Validates a session from the cookie and attaches it to the request.
 * If validation fails, sends an appropriate error response and stops the chain.
 */
export const requireSession = async (req: Request, res: Response, next: NextFunction) => {
  const sessionId = req.cookies?.sessionId

  if (!sessionId || typeof sessionId !== 'string') {
    const error = {
      type: 'ApplicationFailure' as const,
      subtype: 'MissingSession' as const,
      message: 'Session cookie is required'
    }
    sendErrorResponse(res, error)
    return
  }

  const result = await findSessionById(sessionId)

  if (!result.isSuccess) {
    // Map the error (could be InfrastructureFailure with subtype 'SessionNotFound' etc.)
    sendErrorResponse(res, result.error)
    return
  }

  const session = result.value
  if (isSessionExpired(session)) {
    const error = {
      type: 'DomainFailure' as const,
      subtype: 'SessionExpired' as const,
      message: 'Session has expired'
    }
    sendErrorResponse(res, error)
    return
  }

  // Attach session and userId to response locals for downstream handlers
  res.locals.session = session
  res.locals.userId = session.userId

  next()
}

/**
 * Helper to retrieve session without failing (returns Result).
 * Useful for optional authentication.
 */
export const getSession = async (sessionId: string): Promise<Result<any>> => {
  if (!sessionId) {
    return {
      isSuccess: false,
      error: {
        type: 'ApplicationFailure',
        subtype: 'MissingSession',
        message: 'Session cookie is required'
      }
    }
  }

  const result = await findSessionById(sessionId)
  if (!result.isSuccess) return result

  if (isSessionExpired(result.value)) {
    return {
      isSuccess: false,
      error: {
        type: 'DomainFailure',
        subtype: 'SessionExpired',
        message: 'Session has expired'
      }
    }
  }

  return result
}