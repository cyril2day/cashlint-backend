import { compose, curry2 } from 'pristine-fp'
import { map as _map, filter as _filter, sum as _sum } from 'pristine-fp'
import { equals, truthy, existy, safeProp, not, defaultTo, when, unless, gt, ifElse } from 'pristine-fp'
import { Result, Success, Failure } from '@/common/types/result'
import { ApplicationFailure } from '@/common/types/errors'

/**
 * Curried map with iteratee‑first signature (Ramda style).
 */
export const map = curry2(
  <T, U>(collection: T[], iteratee: (item: T) => U): U[] => _map(collection, iteratee)
)

/**
 * Curried filter with predicate‑first signature.
 */
export const filter = curry2(
  <T>(collection: T[], predicate: (item: T) => boolean): T[] => _filter(collection, predicate)
)

/**
 * Sum is already a unary function; we keep it as is.
 */
export const sum = _sum

/**
 * Pipe composes functions from left to right.
 * This is simply `compose` with arguments reversed.
 */
export const pipe = (...fns: Array<(arg: any) => any>) => compose(...fns.reverse())

/**
 * Returns a predicate that is true only when **all** of the given predicates are true.
 * @param predicates Array of predicate functions
 * @returns A single predicate that evaluates all predicates
 */
export const allOf = <T>(...predicates: Array<(x: T) => boolean>) => (value: T): boolean =>
  predicates.every(pred => pred(value))

/**
 * Returns a predicate that is true when **any** of the given predicates is true.
 * @param predicates Array of predicate functions
 * @returns A single predicate that evaluates any predicate
 */
export const anyOf = <T>(...predicates: Array<(x: T) => boolean>) => (value: T): boolean =>
  predicates.some(pred => pred(value))

/**
 * Predicates
 */
export const isString = (x: unknown): x is string => typeof x === 'string'
export const isNull = equals(null)
export const isUndefined = equals(undefined)
export const isNullOrUndefined = anyOf(isNull, isUndefined)

/**
 * Validates that a value is a required string.
 * Returns Success(value) if truthy and isString, otherwise Failure(ApplicationFailure).
 */
export const validateRequiredString = (value: unknown, fieldName: string): Result<string> =>
  ifElse(
    () => truthy(value) && isString(value),
    () => Success(value as string),
    () => Failure(ApplicationFailure('MissingField', `${fieldName} is required and must be a string`))
  )

/**
 * Safe property access with default value.
 */
export const safePropOr = <T>(obj: unknown, path: string, defaultValue: T): T =>
  safeProp(obj as any, path as any, defaultValue)