import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { LoanPayment } from '../domain/purchasing'
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
            'Loan payment journal entry already exists.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'LoanPaymentRepositoryError' as PurchasingInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'LoanPaymentRepositoryError' as PurchasingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain LoanPayment
const toDomainLoanPayment = (prismaPayment: any): LoanPayment => ({
  id: prismaPayment.id,
  loanId: prismaPayment.loanId,
  principalAmount: Number(prismaPayment.principalAmount),
  interestAmount: Number(prismaPayment.interestAmount),
  date: prismaPayment.date,
  description: prismaPayment.description ?? undefined,
  journalEntryId: prismaPayment.journalEntryId,
  createdAt: prismaPayment.createdAt,
  updatedAt: prismaPayment.updatedAt,
})

/**
 * Create a new loan payment in the database.
 */
export const createLoanPayment = (payment: Omit<LoanPayment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<LoanPayment>> => {
  const action = prisma.loanPayment.create({
    data: {
      loanId: payment.loanId,
      principalAmount: payment.principalAmount,
      interestAmount: payment.interestAmount,
      date: payment.date,
      description: payment.description,
      journalEntryId: payment.journalEntryId,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainLoanPayment(result.value))
      : result
  )
}

/**
 * Find a loan payment by ID and user ID (via loan) to ensure isolation.
 */
export const findLoanPaymentById = (userId: string, paymentId: string): Promise<Result<LoanPayment | null>> => {
  const action = prisma.loanPayment.findFirst({
    where: {
      id: paymentId,
      loan: {
        userId,
      },
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainLoanPayment(result.value) : null)
      : result
  )
}

/**
 * List all loan payments for a specific loan (user‑isolated).
 */
export const listLoanPaymentsByLoan = (userId: string, loanId: string): Promise<Result<LoanPayment[]>> => {
  const action = prisma.loanPayment.findMany({
    where: {
      loanId,
      loan: {
        userId,
      },
    },
    orderBy: { date: 'asc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainLoanPayment))
      : result
  )
}