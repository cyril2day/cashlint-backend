import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PeriodCloseDomainSubtype } from '../domain/errors'
import { Period } from '../domain/period'
import { validatePeriodName, validatePeriodDateRange } from '../domain/period'
import { createPeriod as createPeriodRepo } from '../infrastructure/periodRepo'

// Command: input from API
export type CreatePeriodCommand = {
  userId: string
  name: string
  startDate: string // ISO string
  endDate: string   // ISO string
}

// Pure validation of command data
const validateCommand = (command: CreatePeriodCommand): Result<CreatePeriodCommand> => {
  // Validate name
  const nameResult = validatePeriodName(command.name)
  if (!nameResult.isSuccess) return nameResult as Result<CreatePeriodCommand>

  // Parse dates
  const startDate = new Date(command.startDate)
  const endDate = new Date(command.endDate)
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return Failure(
      DomainFailure(
        'InvalidPeriodDateRange' as PeriodCloseDomainSubtype,
        'Start date or end date is invalid'
      )
    )
  }

  // Validate date range
  const dateRangeResult = validatePeriodDateRange(startDate, endDate)
  if (!dateRangeResult.isSuccess) return dateRangeResult as Result<CreatePeriodCommand>

  return Success(command)
}

// Create period workflow
export const createPeriodWorkflow = async (command: CreatePeriodCommand): Promise<Result<Period>> => {
  // Step 1: Validate command
  const validationResult = validateCommand(command)
  if (!validationResult.isSuccess) return validationResult as Result<Period>

  // Step 2: Build domain entity
  const periodToCreate: Omit<Period, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    name: command.name,
    startDate: new Date(command.startDate),
    endDate: new Date(command.endDate),
    status: 'Open',
  }

  // Step 3: Persist via repository
  return createPeriodRepo(periodToCreate)
}