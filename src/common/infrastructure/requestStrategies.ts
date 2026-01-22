import { safeProp, when, truthy } from 'pristine-fp'
import { allOf, isString, firstTruthy, pipe } from '@/shared/fp-utils'
import { fromNullable } from '@/common/types/result'
import type { Request } from 'express'

// ------------------------------
// Named predicates & transformers
// ------------------------------
const hasBearerPrefix = (s: string) => s.startsWith('Bearer ')

// ------------------------------
// Strategy: extract from Authorization header (adapted from tokenAuthMiddleware)
// ------------------------------
export const extractBearerToken = (req: Request): string | undefined =>
  pipe(
    () => safeProp(req.headers, 'authorization'),
    (authHeader) => when(isString(authHeader), () => authHeader),
    (maybeString) => when(isString(maybeString), () => maybeString),
    (str) => when(allOf(truthy, hasBearerPrefix)(str), () => str.slice(7).trim())
  )()

// ------------------------------
// Strategy: extract from session cookie
// ------------------------------
const fromSessionCookie = (req: Request): string | undefined => {
  const cookie = safeProp(req.cookies, 'sessionId')
  return when(isString(cookie), () => cookie)
}

// ------------------------------
// Combined strategy: try header, then cookie (first truthy)
// ------------------------------
export const extractSessionId = (req: Request): string | undefined =>
  firstTruthy(
    extractBearerToken(req),
    fromSessionCookie(req)
  )

// ------------------------------
// Safe conversion to Result<string>
// ------------------------------
const missingSessionError = {
  type: 'ApplicationFailure' as const,
  subtype: 'MissingSession' as const,
  message: 'Authentication required: provide a bearer token or session cookie'
} as const

export const sessionIdToResult = (req: Request) =>
  pipe(
    extractSessionId,
    fromNullable(missingSessionError)
  )(req)