// -------- TYPES --------

export type Option<T> = Some<T> | None<T>

export interface Some<T> {
  readonly _tag: 'Some'
  readonly value: T
}

export interface None<T> {
  readonly _tag: 'None'
}

// -------- CONSTRUCTORS --------

export const Some = <T>(value: T): Option<T> => ({ _tag: 'Some', value })

export const None = <T>(): Option<T> => ({ _tag: 'None' })

// -------- GUARDS --------

export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option._tag === 'Some'

export const isNone = <T>(option: Option<T>): option is None<T> =>
  option._tag === 'None'

// -------- CORE OPERATIONS --------

/**
 * Create an Option from a nullable value.
 * If the value is null or undefined, returns None.
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? None() : Some(value)

/**
 * Create an Option from a value that may be falsy (empty string, 0, false).
 * Uses a predicate to determine if the value is considered "present".
 * By default, uses `!!value` (truthy).
 */
export const fromFalsy = <T>(
  value: T,
  predicate: (x: T) => boolean = x => !!x
): Option<T> => predicate(value) ? Some(value) : None()

/**
 * Get the value if Some, otherwise return a default.
 */
export const getOrElse = <T>(defaultValue: T) => (option: Option<T>): T =>
  isSome(option) ? option.value : defaultValue

/**
 * Transform the inner value if Some.
 */
export const map = <T, U>(f: (x: T) => U) => (option: Option<T>): Option<U> =>
  isSome(option) ? Some(f(option.value)) : None()

/**
 * Chain computations that may fail (return an Option).
 */
export const flatMap = <T, U>(f: (x: T) => Option<U>) => (option: Option<T>): Option<U> =>
  isSome(option) ? f(option.value) : None()

/**
 * Alias for flatMap.
 */
export const chain = flatMap

/**
 * Apply a function that returns a Result to the inner value, converting Result to Option.
 * Useful for integrating with Result types.
 */
export const chainResult = <T, U, E>(f: (x: T) => { isSuccess: true, value: U } | { isSuccess: false, error: E }) =>
  (option: Option<T>): Option<U> => {
    if (isSome(option)) {
      const result = f(option.value)
      if (result.isSuccess) {
        return Some(result.value)
      }
    }
    return None()
  }

/**
 * Fold (or match) over the Option: handle both cases.
 */
export const fold = <T, U>(
  onNone: () => U,
  onSome: (value: T) => U
) => (option: Option<T>): U =>
  isSome(option) ? onSome(option.value) : onNone()

/**
 * Tap into the value for side effects (e.g., logging) without affecting the pipeline.
 */
export const tap = <T>(effect: (x: T) => void) => (option: Option<T>): Option<T> => {
  if (isSome(option)) effect(option.value)
  return option
}

/**
 * Convert Option to a Result.
 */
export const toResult = <T, E>(error: E) => (option: Option<T>): { isSuccess: true, value: T } | { isSuccess: false, error: E } =>
  isSome(option) ? { isSuccess: true, value: option.value } : { isSuccess: false, error }

/**
 * Convert Option to nullable (for interoperability).
 */
export const toNullable = <T>(option: Option<T>): T | null =>
  isSome(option) ? option.value : null

/**
 * Convert Option to undefined.
 */
export const toUndefined = <T>(option: Option<T>): T | undefined =>
  isSome(option) ? option.value : undefined

// -------- UTILITIES --------

/**
 * Filter an Option with a predicate.
 */
export const filter = <T>(predicate: (x: T) => boolean) => (option: Option<T>): Option<T> =>
  isSome(option) && predicate(option.value) ? option : None()

/**
 * Get the value if Some, otherwise throw an error.
 */
export const getOrThrow = <T>(error?: Error) => (option: Option<T>): T => {
  if (isSome(option)) return option.value
  throw error || new Error('Value is None')
}

/**
 * Combine two Options into a tuple Option.
 */
export const zip = <A, B>(optA: Option<A>, optB: Option<B>): Option<[A, B]> =>
  isSome(optA) && isSome(optB) ? Some([optA.value, optB.value]) : None()

/**
 * Combine multiple Options with a function (lift).
 */
export const lift2 = <A, B, C>(f: (a: A, b: B) => C) => (optA: Option<A>, optB: Option<B>): Option<C> =>
  isSome(optA) && isSome(optB) ? Some(f(optA.value, optB.value)) : None()

/**
 * Ramda-style pipe for Option.
 */
export const pipe = <T>(option: Option<T>) => ({
  map: <U>(f: (x: T) => U) => pipe(map(f)(option)),
  flatMap: <U>(f: (x: T) => Option<U>) => pipe(flatMap(f)(option)),
  chain: <U>(f: (x: T) => Option<U>) => pipe(chain(f)(option)),
  filter: (predicate: (x: T) => boolean) => pipe(filter(predicate)(option)),
  getOrElse: (defaultValue: T) => getOrElse(defaultValue)(option),
  fold: <U>(onNone: () => U, onSome: (value: T) => U) => fold(onNone, onSome)(option),
})