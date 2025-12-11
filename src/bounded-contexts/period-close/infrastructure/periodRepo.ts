import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure, DomainFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Period, PeriodStatus } from '../domain/period'
import { PeriodCloseInfrastructureSubtype, PeriodCloseDomainSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as PeriodCloseInfrastructureSubtype,
            'Period with same name already exists for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'PeriodRepositoryError' as PeriodCloseInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'PeriodRepositoryError' as PeriodCloseInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Period
const toDomainPeriod = (prismaPeriod: any): Period => ({
  id: prismaPeriod.id,
  userId: prismaPeriod.userId,
  name: prismaPeriod.name,
  startDate: prismaPeriod.startDate,
  endDate: prismaPeriod.endDate,
  status: prismaPeriod.status as PeriodStatus,
  closedAt: prismaPeriod.closedAt ?? undefined,
  createdAt: prismaPeriod.createdAt,
  updatedAt: prismaPeriod.updatedAt,
})

/**
 * Create a new period in the database.
 */
export const createPeriod = (period: Omit<Period, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Period>> => {
  const action = prisma.period.create({
    data: {
      userId: period.userId,
      name: period.name,
      startDate: period.startDate,
      endDate: period.endDate,
      status: period.status,
      closedAt: period.closedAt,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainPeriod(result.value))
      : result
  )
}

/**
 * Find a period by ID and user ID (ensures isolation).
 */
export const findPeriodById = (userId: string, periodId: string): Promise<Result<Period | null>> => {
  const action = prisma.period.findFirst({
    where: { id: periodId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainPeriod(result.value) : null)
      : result
  )
}

/**
 * Update a period by ID and user ID.
 */
export const updatePeriod = (userId: string, periodId: string, data: Partial<Period>): Promise<Result<Period>> => {
  const action = prisma.period.update({
    where: { id: periodId, userId },
    data: {
      ...data,
      // Ensure we don't accidentally set undefined fields
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainPeriod(result.value))
      : result
  )
}

/**
 * List periods for a user, optionally filtered by status.
 */
export const listPeriods = (userId: string, filters?: { status?: PeriodStatus }): Promise<Result<Period[]>> => {
  const action = prisma.period.findMany({
    where: { userId, ...(filters?.status && { status: filters.status }) },
    orderBy: { startDate: 'desc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainPeriod))
      : result
  )
}