import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { JournalEntry, JournalLine, JournalLineSide } from '../domain/ledger'
import { LedgerInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      // P2002 is duplicate key, but journal entries don't have unique constraints except id
      // P2003 foreign key constraint fails (accountId missing)
      if (e.code === 'P2003') {
        return Failure(
          InfrastructureFailure(
            'AccountRepositoryError' as LedgerInfrastructureSubtype,
            'Referenced account does not exist.',
            e
          )
        )
      }
      return Failure(
        InfrastructureFailure(
          'JournalEntryRepositoryError' as LedgerInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'JournalEntryRepositoryError' as LedgerInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain JournalEntry
const toDomainJournalLine = (prismaLine: any): JournalLine => ({
  id: prismaLine.id,
  accountId: prismaLine.accountId,
  amount: Number(prismaLine.amount),
  side: prismaLine.side as JournalLineSide,
})

const toDomainJournalEntry = (prismaEntry: any): JournalEntry => ({
  id: prismaEntry.id,
  userId: prismaEntry.userId,
  entryNumber: prismaEntry.entryNumber ?? undefined,
  description: prismaEntry.description,
  date: prismaEntry.date,
  lines: prismaEntry.lines.map(toDomainJournalLine),
  createdAt: prismaEntry.createdAt,
  updatedAt: prismaEntry.updatedAt,
})

/**
 * Create a new journal entry with its lines in the database.
 * Uses a transaction to ensure atomicity.
 */
export const createJournalEntry = (entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<JournalEntry>> => {
  const action = prisma.$transaction(async (tx) => {
    const createdEntry = await tx.journalEntry.create({
      data: {
        userId: entry.userId,
        entryNumber: entry.entryNumber,
        description: entry.description,
        date: entry.date,
        lines: {
          create: entry.lines.map(line => ({
            accountId: line.accountId,
            amount: line.amount,
            side: line.side,
          })),
        },
      },
      include: {
        lines: true,
      },
    })
    return createdEntry
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainJournalEntry(result.value))
      : result
  )
}

/**
 * Find a journal entry by ID and user ID (ensures isolation).
 */
export const findJournalEntryById = (userId: string, entryId: string): Promise<Result<JournalEntry | null>> => {
  const action = prisma.journalEntry.findFirst({
    where: { id: entryId, userId },
    include: { lines: true },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainJournalEntry(result.value) : null)
      : result
  )
}

/**
 * List journal entries for a user with optional pagination.
 */
export const listJournalEntries = (userId: string, options?: { skip?: number; take?: number }): Promise<Result<JournalEntry[]>> => {
  const action = prisma.journalEntry.findMany({
    where: { userId },
    include: { lines: true },
    orderBy: { date: 'desc' },
    skip: options?.skip,
    take: options?.take,
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainJournalEntry))
      : result
  )
}