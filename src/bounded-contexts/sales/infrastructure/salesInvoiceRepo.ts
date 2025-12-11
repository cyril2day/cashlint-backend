import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { SalesInvoice, InvoiceStatus } from '../domain/sales'
import { SalesInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on invoice number per user? We'll assume unique composite of userId and invoiceNumber)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as SalesInfrastructureSubtype,
            'Invoice number already exists for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'SalesInvoiceRepositoryError' as SalesInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'SalesInvoiceRepositoryError' as SalesInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain SalesInvoice
const toDomainSalesInvoice = (prismaInvoice: any): SalesInvoice => ({
  id: prismaInvoice.id,
  userId: prismaInvoice.userId,
  customerId: prismaInvoice.customerId,
  invoiceNumber: prismaInvoice.invoiceNumber,
  total: Number(prismaInvoice.total),
  status: prismaInvoice.status as InvoiceStatus,
  date: prismaInvoice.date,
  dueDate: prismaInvoice.dueDate ?? undefined,
  description: prismaInvoice.description ?? undefined,
  journalEntryId: prismaInvoice.journalEntryId,
  createdAt: prismaInvoice.createdAt,
  updatedAt: prismaInvoice.updatedAt,
})

/**
 * Create a new sales invoice in the database.
 * If a transaction client is provided, the operation will be part of that transaction.
 */
export const createSalesInvoice = (
  invoice: Omit<SalesInvoice, 'id' | 'createdAt' | 'updatedAt'>,
  tx?: Prisma.TransactionClient
): Promise<Result<SalesInvoice>> => {
  const client = tx ?? prisma
  const action = client.salesInvoice.create({
    data: {
      userId: invoice.userId,
      customerId: invoice.customerId,
      invoiceNumber: invoice.invoiceNumber,
      total: invoice.total,
      status: invoice.status,
      date: invoice.date,
      dueDate: invoice.dueDate,
      description: invoice.description,
      journalEntryId: invoice.journalEntryId,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainSalesInvoice(result.value))
      : result
  )
}

/**
 * Find a sales invoice by ID and user ID (ensures isolation).
 */
export const findSalesInvoiceById = (userId: string, invoiceId: string): Promise<Result<SalesInvoice | null>> => {
  const action = prisma.salesInvoice.findFirst({
    where: { id: invoiceId, userId },
    include: { payments: true },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainSalesInvoice(result.value) : null)
      : result
  )
}

/**
 * Find a sales invoice by invoice number and user ID.
 */
export const findSalesInvoiceByNumber = (userId: string, invoiceNumber: string): Promise<Result<SalesInvoice | null>> => {
  const action = prisma.salesInvoice.findFirst({
    where: { invoiceNumber, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainSalesInvoice(result.value) : null)
      : result
  )
}

/**
 * List all sales invoices for a user with optional pagination.
 */
export const listSalesInvoices = (userId: string, options?: { skip?: number; take?: number }): Promise<Result<SalesInvoice[]>> => {
  const action = prisma.salesInvoice.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    skip: options?.skip,
    take: options?.take,
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainSalesInvoice))
      : result
  )
}

/**
 * Update the status of a sales invoice.
 * If a transaction client is provided, the operation will be part of that transaction.
 */
export const updateSalesInvoiceStatus = (
  userId: string,
  invoiceId: string,
  status: InvoiceStatus,
  tx?: Prisma.TransactionClient
): Promise<Result<SalesInvoice>> => {
  const client = tx ?? prisma
  const action = client.salesInvoice.update({
    where: { id: invoiceId, userId },
    data: { status },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainSalesInvoice(result.value))
      : result
  )
}

/**
 * Update the journal entry reference of a sales invoice.
 */
export const updateSalesInvoiceJournalEntryId = (userId: string, invoiceId: string, journalEntryId: string): Promise<Result<SalesInvoice>> => {
  const action = prisma.salesInvoice.update({
    where: { id: invoiceId, userId },
    data: { journalEntryId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainSalesInvoice(result.value))
      : result
  )
}