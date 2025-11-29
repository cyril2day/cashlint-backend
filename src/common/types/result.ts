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