import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Loan } from '../domain/purchasing'
import { PurchasingInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on loan per vendor? Not defined)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as PurchasingInfrastructureSubtype,
            'Loan might already exist for this vendor.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'LoanRepositoryError' as PurchasingInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'LoanRepositoryError' as PurchasingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Loan
const toDomainLoan = (prismaLoan: any): Loan => ({
  id: prismaLoan.id,
  userId: prismaLoan.userId,
  vendorId: prismaLoan.vendorId,
  principal: Number(prismaLoan.principal),
  interestRate: prismaLoan.interestRate ? Number(prismaLoan.interestRate) : undefined,
  term: prismaLoan.term ?? undefined,
  createdAt: prismaLoan.createdAt,
  updatedAt: prismaLoan.updatedAt,
})

/**
 * Create a new loan in the database.
 */
export const createLoan = (loan: Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Loan>> => {
  const action = prisma.loan.create({
    data: {
      userId: loan.userId,
      vendorId: loan.vendorId,
      principal: loan.principal,
      interestRate: loan.interestRate,
      term: loan.term,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainLoan(result.value))
      : result
  )
}

/**
 * Find a loan by ID and user ID (ensures isolation).
 */
export const findLoanById = (userId: string, loanId: string): Promise<Result<Loan | null>> => {
  const action = prisma.loan.findFirst({
    where: { id: loanId, userId },
    include: { payments: true },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainLoan(result.value) : null)
      : result
  )
}

/**
 * List all loans for a user.
 */
export const listLoans = (userId: string): Promise<Result<Loan[]>> => {
  const action = prisma.loan.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainLoan))
      : result
  )
}

/**
 * Find a loan by vendor ID and user ID (ensures isolation).
 * Assumes at most one loan per vendor (but returns the first if multiple).
 */
export const findLoanByVendorId = (userId: string, vendorId: string): Promise<Result<Loan | null>> => {
  const action = prisma.loan.findFirst({
    where: { userId, vendorId },
    include: { payments: true },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainLoan(result.value) : null)
      : result
  )
}

/**
 * Update loan principal (e.g., after a payment).
 */
export const updateLoanPrincipal = (userId: string, loanId: string, newPrincipal: number): Promise<Result<Loan>> => {
  const action = prisma.loan.update({
    where: { id: loanId, userId },
    data: { principal: newPrincipal },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainLoan(result.value))
      : result
  )
}