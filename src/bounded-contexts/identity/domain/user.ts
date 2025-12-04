import * as R from 'ramda'
import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'

export type User = {
  id?: string
  username: string
  createdAt?: Date
}

const minimumUsernameLength = 3

// --- Pure Calculations ---

const isTooShort = (s: string) => s.length < minimumUsernameLength 
const hasInvalidChars = (s: string) => !/^[a-z0-9_]+$/.test(s)

/**
 * Validates and normalizes a username using pure composition.
 * Returns a Result<string> which is either Success(normalizedUsername) or Failure(DomainFailure).
 */
export const validateUsername = (input: string): Result<string> => {
  // Functional composition for normalization
  const normalized = R.pipe(R.trim, R.toLower)(input || '')

  if (isTooShort(normalized)) {
    return Failure(
      DomainFailure(
        'InvalidUsername', 
        'Username must be at least 3 characters.'
      )
    )
  }
  if (hasInvalidChars(normalized)) {
    return Failure(
      DomainFailure(
        'InvalidUsername', 
        'Username must be alphanumeric and underscores only (no spaces).'
      )
    )
  }

  // Returns the normalized, validated username on the Success track
  return Success(normalized)
}