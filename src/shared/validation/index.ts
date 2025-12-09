import * as R from 'ramda'
import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure, AppError } from '@/common/types/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

// -------- PREDICATES --------

/**
 * Predicate: string is not empty after trim.
 */
export const isNonEmptyString = (s: string): boolean =>
  s.trim().length > 0

/**
 * Predicate: string length within bounds.
 */
export const isLengthWithin = (min: number, max: number) => (s: string): boolean => {
  const trimmed = s.trim()
  return trimmed.length >= min && trimmed.length <= max
}

/**
 * Predicate: value is a positive number with at most two decimal places.
 */
export const isPositiveMoney = (amount: number): boolean =>
  amount > 0 && Number.isFinite(amount) && Math.round(amount * 100) === amount * 100

/**
 * Predicate: value is a valid Date (not invalid).
 */
export const isValidDate = (date: Date): boolean =>
  date instanceof Date && !isNaN(date.getTime())

/**
 * Predicate: date is not in the future (allow same moment).
 */
export const isDateNotFuture = (date: Date): boolean =>
  date <= new Date()

/**
 * Predicate: email format (optional, can be undefined or empty).
 */
export const isValidEmailFormat = (email: string | undefined): boolean =>
  email === undefined || email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

/**
 * Predicate: string matches a regex pattern.
 */
export const matchesPattern = (pattern: RegExp) => (s: string): boolean =>
  pattern.test(s)

// -------- VALIDATION BUILDERS --------

/**
 * Create a validation function that returns a Result with a DomainFailure on failure.
 */
const makeValidator = <T>(
  predicate: (value: T) => boolean,
  errorSubtype: string,
  errorMessage: string
) => (value: T): Result<T> =>
  predicate(value)
    ? Success(value)
    : Failure(DomainFailure(errorSubtype, errorMessage))

/**
 * Create a validation function that trims the string before validation.
 */
const makeStringValidator = (
  predicate: (s: string) => boolean,
  errorSubtype: string,
  errorMessage: string
) => (value: string): Result<string> => {
  const trimmed = value.trim()
  return predicate(trimmed)
    ? Success(trimmed)
    : Failure(DomainFailure(errorSubtype, errorMessage))
}

// -------- COMMON VALIDATORS (GENERIC) --------

/**
 * Validate a string is non-empty.
 */
export const validateNonEmptyString = makeStringValidator(
  isNonEmptyString,
  'InvalidString',
  'Must not be empty'
)

/**
 * Validate string length.
 */
export const validateStringLength = (min: number, max: number, subtype: string = 'InvalidLength') =>
  makeStringValidator(
    isLengthWithin(min, max),
    subtype,
    `Must be between ${min} and ${max} characters`
  )

/**
 * Validate positive money amount with custom error subtype and message.
 */
export const validatePositiveMoneyWith = (subtype: string = 'InvalidAmount', message?: string) =>
  makeValidator(
    isPositiveMoney,
    subtype,
    getOrElse('Amount must be positive and have at most two decimal places')(fromNullable(message))
  )

/**
 * Default positive money validator (generic error).
 */
export const validatePositiveMoney = validatePositiveMoneyWith('InvalidAmount')

/**
 * Validate a date is valid (not invalid Date).
 */
export const validateDateValid = makeValidator(
  isValidDate,
  'InvalidDate',
  'Date must be a valid date'
)

/**
 * Validate date is not in the future.
 */
export const validateDateNotFuture = (date: Date): Result<Date> => {
  if (!isValidDate(date)) {
    return Failure(DomainFailure('InvalidDate', 'Date must be a valid date'))
  }
  if (!isDateNotFuture(date)) {
    return Failure(DomainFailure('DateInFuture', 'Date cannot be in the future'))
  }
  return Success(date)
}

/**
 * Validate email format (optional).
 * Returns Success(undefined) for empty/undefined, Success(email) if valid, Failure otherwise.
 */
export const validateEmailOptional = (email: string | undefined): Result<string | undefined> => {
  if (email === undefined || email === '') {
    return Success(undefined)
  }
  const trimmed = email.trim()
  if (!isValidEmailFormat(trimmed)) {
    return Failure(DomainFailure('InvalidEmail', 'Email must be a valid email address'))
  }
  return Success(trimmed)
}

/**
 * Validate that a value is one of an array of allowed values.
 */
export const validateOneOf = <T>(allowedValues: readonly T[], subtype: string, errorMessage?: string) =>
  makeValidator(
    (value: T) => allowedValues.includes(value),
    subtype,
    getOrElse(`Must be one of: ${allowedValues.join(', ')}`)(fromNullable(errorMessage))
  )

/**
 * Validate a string matches a regex pattern.
 */
export const validatePattern = (pattern: RegExp, subtype: string, errorMessage: string) =>
  makeStringValidator(
    matchesPattern(pattern),
    subtype,
    errorMessage
  )

// -------- COMPOSITION HELPERS --------

/**
 * Pipe multiple validators together (railway style).
 * Each validator is a function (value: T) => Result<T>.
 * Returns a function that runs all validators sequentially, failing on first failure.
 */
export const pipeValidators = <T>(...validators: Array<(value: T) => Result<T>>) =>
  (value: T): Result<T> => {
    let current: Result<T> = Success(value)
    for (const validator of validators) {
      current = validator(current.isSuccess ? current.value : value)
      if (!current.isSuccess) break
    }
    return current
  }

/**
 * Combine multiple validators for an object's fields.
 * Returns a Result of the validated object.
 */
export const validateObject = <T extends Record<string, any>>(
  validators: { [K in keyof T]?: (value: T[K]) => Result<T[K]> }
) => (obj: T): Result<T> => {
  const validated: Partial<T> = {}
  for (const key in validators) {
    const validator = validators[key]
    if (validator) {
      const result = validator(obj[key])
      if (!result.isSuccess) return result as Result<T>
      validated[key] = result.value
    } else {
      validated[key] = obj[key]
    }
  }
  return Success(validated as T)
}