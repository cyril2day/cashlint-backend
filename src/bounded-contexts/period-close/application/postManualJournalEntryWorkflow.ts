import { Result, Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { PeriodCloseDomainSubtype, PeriodCloseApplicationSubtype } from '../domain/errors'
import { listPeriods } from '../infrastructure/periodRepo'
import { postJournalEntryWorkflow } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'
import type { PostJournalEntryCommand } from '@/bounded-contexts/ledger/application/postJournalEntryWorkflow'

export type PostManualJournalEntryCommand = PostJournalEntryCommand // same structure

const validateCommand = (command: PostManualJournalEntryCommand): Result<PostManualJournalEntryCommand> => {
  if (!command.description || command.description.trim() === '') {
    return Failure(
      DomainFailure(
        'InvalidCommand' as PeriodCloseApplicationSubtype,
        'Description is required'
      )
    )
  }
  if (!command.date || command.date.trim() === '') {
    return Failure(
      DomainFailure(
        'InvalidCommand' as PeriodCloseApplicationSubtype,
        'Date is required'
      )
    )
  }
  if (!command.lines || command.lines.length === 0) {
    return Failure(
      DomainFailure(
        'InvalidCommand' as PeriodCloseApplicationSubtype,
        'At least one journal line is required'
      )
    )
  }
  return Success(command)
}

const validateDateInOpenPeriod = async (userId: string, date: Date): Promise<Result<null>> => {
  const periodsResult = await listPeriods(userId, { status: 'Open' })
  if (!periodsResult.isSuccess) return periodsResult as Result<null>

  const isInOpenPeriod = periodsResult.value.some(p => p.startDate <= date && p.endDate >= date)
  if (!isInOpenPeriod) {
    return Failure(
      DomainFailure(
        'PeriodNotOpen' as PeriodCloseDomainSubtype,
        'The date is not within any open period'
      )
    )
  }
  return Success(null)
}

export const postManualJournalEntryWorkflow = async (command: PostManualJournalEntryCommand): Promise<Result<any>> => {
  // Step 1: Validate command
  const commandValidation = validateCommand(command)
  if (!commandValidation.isSuccess) return commandValidation

  // Step 2: Validate date in open period
  const date = new Date(command.date)
  if (isNaN(date.getTime())) {
    return Failure(
      DomainFailure(
        'InvalidCommand' as PeriodCloseApplicationSubtype,
        'Invalid date format'
      )
    )
  }

  const periodValidation = await validateDateInOpenPeriod(command.userId, date)
  if (!periodValidation.isSuccess) return periodValidation

  // Step 3: Post the journal entry using the ledger workflow
  return postJournalEntryWorkflow(command)
}