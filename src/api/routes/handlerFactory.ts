import { Request, Response } from 'express'
import { fold, andThenAsync, type Result } from '@/common/types/result'
import { pipe } from '@/shared/fp-utils'
import { sendErrorResponse, wrapAsyncRoute } from '@/common/infrastructure/errorMapper'

type Validator<T> = (req: Request) => Result<T>
type Workflow<T, U> = (input: T) => Promise<Result<U>>
type Responder<U> = (res: Response, value: U) => void

/**
 * Creates a route handler that:
 * 1. Validates the request (producing a `Result<T>`)
 * 2. Chains the validated input into an async workflow (producing a `Result<U>`)
 * 3. Maps the success case with a responder, or sends an error response.
 */
export const createHandler = <T, U>(
  validate: Validator<T>,
  workflow: Workflow<T, U>,
  respond: Responder<U>
) => wrapAsyncRoute(async (req: Request, res: Response) => {
  const finalResult = await pipe(
    () => validate(req),
    andThenAsync(workflow)
  )()

  fold<U, void>(
    (error) => sendErrorResponse(res, error),
    (value) => respond(res, value)
  )(finalResult)
})