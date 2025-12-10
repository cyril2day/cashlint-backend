import * as R from 'ramda'
import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { fromNullable, getOrElse } from '@/common/types/option'
import { validateStringLength, validatePattern } from '@/shared/validation'

export type User = {
  id?: string
  username: string
  createdAt?: Date
}

const minimumUsernameLength = 3

// --- Pure Calculations ---

/**
 * Validates and normalizes a username using pure composition.
 * Returns a Result<string> which is either Success(normalizedUsername) or Failure(DomainFailure).
 */
export const validateUsername = (input: string): Result<string> => {
  // Use Option to safely handle null/undefined and provide default
  const safeInput = getOrElse('')(fromNullable(input))
  
  // Functional composition for normalization
  const normalized = R.pipe(R.trim, R.toLower)(safeInput)

  // Use shared validators for length and pattern
  const lengthValidator = validateStringLength(minimumUsernameLength, Infinity, 'InvalidUsername')
  const patternValidator = validatePattern(/^[a-z0-9_]+$/, 'InvalidUsername', 'Username must be alphanumeric and underscores only (no spaces).')

  // Apply length validation
  const lengthResult = lengthValidator(normalized)
  if (!lengthResult.isSuccess) {
    return Failure(
      DomainFailure(
        'InvalidUsername',
        'Username must be at least 3 characters.'
      )
    )
  }

  // Apply pattern validation
  const patternResult = patternValidator(normalized)
  if (!patternResult.isSuccess) {
    // Use the error message from patternValidator
    return patternResult
  }

  // Returns the normalized, validated username on the Success track
  return Success(normalized)
}