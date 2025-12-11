import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure, ApplicationFailure } from '@/common/types/errors'
import { PeriodCloseDomainSubtype, PeriodCloseApplicationSubtype } from '../domain/errors'
import { Period, validatePeriodIsOpen, validatePeriodCanBeClosed } from '../domain/period'
import { findPeriodById, updatePeriod } from '../infrastructure/periodRepo'

// Command: input from API
export type ClosePeriodCommand = {
  userId: string
  periodId: string
}

// Pure validation of command data
const validateCommand = (command: ClosePeriodCommand): Result<ClosePeriodCommand> => {
  if (!command.periodId || command.periodId.trim() === '') {
    return Failure(
      ApplicationFailure(
        'InvalidCommand' as PeriodCloseApplicationSubtype,
        'Period ID is required'
      )
    )
  }
  return Success(command)
}

// Close period workflow
export const closePeriodWorkflow = async (command: ClosePeriodCommand): Promise<Result<Period>> => {
  // Step 1: Validate command
  const validationResult = validateCommand(command)
  if (!validationResult.isSuccess) return validationResult as Result<Period>

  // Step 2: Retrieve period
  const periodResult = await findPeriodById(command.userId, command.periodId)
  if (!periodResult.isSuccess) return periodResult as Result<Period>

  const period = periodResult.value
  if (!period) {
    return Failure(
      DomainFailure(
        'PeriodNotFound' as PeriodCloseDomainSubtype,
        `Period with ID ${command.periodId} not found`
      )
    )
  }

  // Step 3: Domain validation (period is open, can be closed)
  const openValidation = validatePeriodIsOpen(period)
  if (!openValidation.isSuccess) return openValidation

  const canCloseValidation = validatePeriodCanBeClosed(period)
  if (!canCloseValidation.isSuccess) return canCloseValidation

  // Step 4: Update period status to closed and set closedAt
  const updatedPeriod = await updatePeriod(command.userId, command.periodId, {
    status: 'Closed',
    closedAt: new Date(),
  })

  return updatedPeriod
}