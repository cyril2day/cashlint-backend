import { AppError } from './errors'

export type Result<T> = 
  | { isSuccess: true, value: T } 
  | { isSuccess: false, error: AppError }

export const Success = <ValueType>(
  successfulValue: ValueType
): Result<ValueType> => 
  ({ isSuccess: true, value: successfulValue })

export const Failure = (
  error: AppError
): Result<never> => 
  ({ isSuccess: false, error })

// -------- CORE OPERATIONS --------

/**
 * map: Transforms the Success value if the Result is on the Success track.
 * This is used for pure Calculations that do not return another Result.
 * * T: The type of the value currently in the Result.
 * U: The type of the value after transformation.
 */
export const map = <T, U>(
  transformerFunction: (currentValue: T) => U
) => (inputResult: Result<T>): Result<U> =>
  inputResult.isSuccess 
    ? Success(transformerFunction(inputResult.value)) 
    : inputResult

/**
 * andThen (bind/flatMap): Transforms the Success value by running a function that itself returns a Result.
 * This is the primary composition tool for chaining synchronous operations (Calculations).
 * * T: The type of the value currently in the Result.
 * U: The type of the value returned by the next Result (the next step in the pipeline).
 */
export const andThen = <T, U>(
  binderFunction: (currentValue: T) => Result<U>
) => (inputResult: Result<T>): Result<U> =>
  inputResult.isSuccess 
    ? binderFunction(inputResult.value) 
    : inputResult

/**
 * andThenAsync: Asynchronous version of andThen, used for chaining Actions (I/O).
 * * T: The type of the value currently in the Result.
 * U: The type of the value returned by the next Result (the next async step in the pipeline).
 */
export const andThenAsync = <T, U>(
  asyncBinderFunction: (currentValue: T) => Promise<Result<U>>
) => async (inputResult: Result<T>): Promise<Result<U>> =>
  inputResult.isSuccess 
    ? asyncBinderFunction(inputResult.value) 
    : inputResult

// -------- ADDITIONAL UTILITIES --------

/**
 * orElse: If the Result is a Failure, try to recover with another Result.
 */
export const orElse = <T>(
  recoveryFunction: (error: AppError) => Result<T>
) => (inputResult: Result<T>): Result<T> =>
  inputResult.isSuccess ? inputResult : recoveryFunction(inputResult.error)

/**
 * fold: Handle both success and failure cases (pattern matching).
 */
export const fold = <T, U>(
  onFailure: (error: AppError) => U,
  onSuccess: (value: T) => U
) => (inputResult: Result<T>): U =>
  inputResult.isSuccess ? onSuccess(inputResult.value) : onFailure(inputResult.error)

/**
 * tap: Perform a side effect on the success value without changing the result.
 */
export const tap = <T>(
  effect: (value: T) => void
) => (inputResult: Result<T>): Result<T> => {
  if (inputResult.isSuccess) effect(inputResult.value)
  return inputResult
}

/**
 * tapError: Perform a side effect on the error without changing the result.
 */
export const tapError = (
  effect: (error: AppError) => void
) => <T>(inputResult: Result<T>): Result<T> => {
  if (!inputResult.isSuccess) effect(inputResult.error)
  return inputResult
}

/**
 * fromNullable: Create a Result from a nullable value.
 * If value is null or undefined, returns a Failure with the provided error.
 */
export const fromNullable = <T>(error: AppError) => (value: T | null | undefined): Result<T> =>
  value == null ? Failure(error) : Success(value)

/**
 * fromFalsy: Create a Result from a value that may be falsy (empty string, 0, false).
 * Uses a predicate to determine if the value is considered "present".
 */
export const fromFalsy = <T>(
  error: AppError,
  predicate: (x: T) => boolean = x => !!x
) => (value: T): Result<T> =>
  predicate(value) ? Success(value) : Failure(error)

/**
 * fromOption: Convert an Option to a Result.
 */
export const fromOption = <T>(error: AppError) => (option: { _tag: 'Some', value: T } | { _tag: 'None' }): Result<T> =>
  option._tag === 'Some' ? Success(option.value) : Failure(error)

/**
 * getOrElse: Get the value if success, otherwise return a default.
 */
export const getOrElse = <T>(defaultValue: T) => (inputResult: Result<T>): T =>
  inputResult.isSuccess ? inputResult.value : defaultValue

/**
 * getOrThrow: Get the value if success, otherwise throw an error.
 * Useful for contexts where you are certain the result is a success (e.g., after validation).
 */
export const getOrThrow = <T>(inputResult: Result<T>): T => {
  if (inputResult.isSuccess) return inputResult.value
  throw new Error(`Result is a failure: ${JSON.stringify(inputResult.error)}`)
}

/**
 * isSuccess type guard.
 */
export const isSuccess = <T>(inputResult: Result<T>): inputResult is { isSuccess: true, value: T } =>
  inputResult.isSuccess

/**
 * isFailure type guard.
 */
export const isFailure = <T>(inputResult: Result<T>): inputResult is { isSuccess: false, error: AppError } =>
  !inputResult.isSuccess

// -------- COMBINATORS --------

/**
 * all: Combine multiple Results into a single Result of an array.
 * If any of the results is a failure, the first failure is returned.
 */
export const all = <T>(results: Result<T>[]): Result<T[]> => {
  const successes: T[] = []
  for (const result of results) {
    if (result.isSuccess) {
      successes.push(result.value)
    } else {
      return result
    }
  }
  return Success(successes)
}

/**
 * sequence: Alias for `all`.
 */
export const sequence = all

/**
 * lift2: Lift a binary function into the Result context.
 * If either input is a failure, returns that failure (the first one if both are failures).
 */
export const lift2 = <A, B, C>(
  f: (a: A, b: B) => C
) => (ra: Result<A>, rb: Result<B>): Result<C> => {
  if (ra.isSuccess && rb.isSuccess) {
    return Success(f(ra.value, rb.value))
  }
  // If ra is a failure, return it; otherwise rb must be a failure.
  // Both are failures, return ra (the first).
  // This is safe because a failure Result<A> is also a Result<C> for any C.
  return (ra.isSuccess ? rb : ra) as Result<C>
}

/**
 * zip: Combine two Results into a Result of a tuple.
 */
export const zip = <A, B>(ra: Result<A>, rb: Result<B>): Result<[A, B]> =>
  lift2((a, b) => [a, b] as [A, B])(ra, rb)

/**
 * zipWith: Combine two Results with a function.
 */
export const zipWith = <A, B, C>(
  f: (a: A, b: B) => C
) => (ra: Result<A>, rb: Result<B>): Result<C> =>
  lift2(f)(ra, rb)