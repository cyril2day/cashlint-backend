import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { CashExpense } from '../domain/purchasing'
import { PurchasingInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on journalEntryId)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as PurchasingInfrastructureSubtype,
            'Cash expense journal entry already exists.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'CashExpenseRepositoryError' as PurchasingInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'CashExpenseRepositoryError' as PurchasingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain CashExpense
const toDomainCashExpense = (prismaExpense: any): CashExpense => ({
  id: prismaExpense.id,
  userId: prismaExpense.userId,
  vendorId: prismaExpense.vendorId,
  amount: Number(prismaExpense.amount),
  date: prismaExpense.date,
  expenseCategory: prismaExpense.expenseCategory,
  description: prismaExpense.description ?? undefined,
  journalEntryId: prismaExpense.journalEntryId,
  createdAt: prismaExpense.createdAt,
  updatedAt: prismaExpense.updatedAt,
})

/**
 * Create a new cash expense in the database.
 */
export const createCashExpense = (expense: Omit<CashExpense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<CashExpense>> => {
  const action = prisma.cashExpense.create({
    data: {
      userId: expense.userId,
      vendorId: expense.vendorId,
      amount: expense.amount,
      date: expense.date,
      expenseCategory: expense.expenseCategory,
      description: expense.description,
      journalEntryId: expense.journalEntryId,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainCashExpense(result.value))
      : result
  )
}

/**
 * Find a cash expense by ID and user ID (ensures isolation).
 */
export const findCashExpenseById = (userId: string, expenseId: string): Promise<Result<CashExpense | null>> => {
  const action = prisma.cashExpense.findFirst({
    where: { id: expenseId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainCashExpense(result.value) : null)
      : result
  )
}

/**
 * List all cash expenses for a user with optional pagination.
 */
export const listCashExpenses = (userId: string, options?: { skip?: number; take?: number }): Promise<Result<CashExpense[]>> => {
  const action = prisma.cashExpense.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    skip: options?.skip,
    take: options?.take,
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainCashExpense))
      : result
  )
}