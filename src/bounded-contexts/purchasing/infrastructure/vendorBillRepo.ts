import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { VendorBill, VendorBillStatus } from '../domain/purchasing'
import { PurchasingInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on bill number per user)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as PurchasingInfrastructureSubtype,
            'Bill number already exists for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'VendorBillRepositoryError' as PurchasingInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'VendorBillRepositoryError' as PurchasingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain VendorBill
const toDomainVendorBill = (prismaBill: any): VendorBill => ({
  id: prismaBill.id,
  userId: prismaBill.userId,
  vendorId: prismaBill.vendorId,
  billNumber: prismaBill.billNumber,
  amount: Number(prismaBill.amount),
  date: prismaBill.date,
  dueDate: prismaBill.dueDate ?? undefined,
  description: prismaBill.description ?? undefined,
  status: prismaBill.status as VendorBillStatus,
  journalEntryId: prismaBill.journalEntryId,
  createdAt: prismaBill.createdAt,
  updatedAt: prismaBill.updatedAt,
})

/**
 * Create a new vendor bill in the database.
 */
export const createVendorBill = (bill: Omit<VendorBill, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<VendorBill>> => {
  const action = prisma.vendorBill.create({
    data: {
      userId: bill.userId,
      vendorId: bill.vendorId,
      billNumber: bill.billNumber,
      amount: bill.amount,
      date: bill.date,
      dueDate: bill.dueDate,
      description: bill.description,
      status: bill.status,
      journalEntryId: bill.journalEntryId,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainVendorBill(result.value))
      : result
  )
}

/**
 * Find a vendor bill by ID and user ID (ensures isolation).
 */
export const findVendorBillById = (userId: string, billId: string): Promise<Result<VendorBill | null>> => {
  const action = prisma.vendorBill.findFirst({
    where: { id: billId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainVendorBill(result.value) : null)
      : result
  )
}

/**
 * Find a vendor bill by bill number and user ID.
 */
export const findVendorBillByNumber = (userId: string, billNumber: string): Promise<Result<VendorBill | null>> => {
  const action = prisma.vendorBill.findFirst({
    where: { billNumber, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainVendorBill(result.value) : null)
      : result
  )
}

/**
 * List all vendor bills for a user with optional pagination.
 */
export const listVendorBills = (userId: string, options?: { skip?: number; take?: number }): Promise<Result<VendorBill[]>> => {
  const action = prisma.vendorBill.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    skip: options?.skip,
    take: options?.take,
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainVendorBill))
      : result
  )
}

/**
 * Update the status of a vendor bill.
 */
export const updateVendorBillStatus = (userId: string, billId: string, status: VendorBillStatus): Promise<Result<VendorBill>> => {
  const action = prisma.vendorBill.update({
    where: { id: billId, userId },
    data: { status },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainVendorBill(result.value))
      : result
  )
}

/**
 * Update the journal entry reference of a vendor bill.
 */
export const updateVendorBillJournalEntryId = (userId: string, billId: string, journalEntryId: string): Promise<Result<VendorBill>> => {
  const action = prisma.vendorBill.update({
    where: { id: billId, userId },
    data: { journalEntryId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainVendorBill(result.value))
      : result
  )
}