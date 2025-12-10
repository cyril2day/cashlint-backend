import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Payment, PaymentMethod } from '../domain/sales'
import { SalesInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on reference per invoice? Not defined)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as SalesInfrastructureSubtype,
            'Payment reference might already exist for this invoice.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'PaymentRepositoryError' as SalesInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'PaymentRepositoryError' as SalesInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Payment
const toDomainPayment = (prismaPayment: any): Payment => ({
  id: prismaPayment.id,
  invoiceId: prismaPayment.invoiceId,
  amount: Number(prismaPayment.amount),
  date: prismaPayment.date,
  method: prismaPayment.method as PaymentMethod,
  reference: prismaPayment.reference ?? undefined,
  journalEntryId: prismaPayment.journalEntryId,
  createdAt: prismaPayment.createdAt,
})

/**
 * Create a new payment in the database.
 */
export const createPayment = (payment: Omit<Payment, 'id' | 'createdAt'>): Promise<Result<Payment>> => {
  const action = prisma.payment.create({
    data: {
      invoiceId: payment.invoiceId,
      amount: payment.amount,
      date: payment.date,
      method: payment.method,
      reference: payment.reference,
      journalEntryId: payment.journalEntryId,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainPayment(result.value))
      : result
  )
}

/**
 * Find a payment by ID and user ID (via invoice) to ensure isolation.
 */
export const findPaymentById = (userId: string, paymentId: string): Promise<Result<Payment | null>> => {
  const action = prisma.payment.findFirst({
    where: {
      id: paymentId,
      invoice: {
        userId,
      },
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainPayment(result.value) : null)
      : result
  )
}

/**
 * List all payments for a specific invoice (user‑isolated).
 */
export const listPaymentsByInvoice = (userId: string, invoiceId: string): Promise<Result<Payment[]>> => {
  const action = prisma.payment.findMany({
    where: {
      invoiceId,
      invoice: {
        userId,
      },
    },
    orderBy: { date: 'asc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainPayment))
      : result
  )
}

/**
 * Calculate the total amount already paid for an invoice.
 */
export const getTotalPaidForInvoice = (userId: string, invoiceId: string): Promise<Result<number>> => {
  const action = prisma.payment.aggregate({
    where: {
      invoiceId,
      invoice: {
        userId,
      },
    },
    _sum: {
      amount: true,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(Number(result.value._sum.amount ?? 0))
      : result
  )
}