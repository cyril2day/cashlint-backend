import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Vendor } from '../domain/purchasing'
import { PurchasingInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on vendor name per user? Not defined, but could be)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as PurchasingInfrastructureSubtype,
            'Vendor name might already exist for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'VendorRepositoryError' as PurchasingInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'VendorRepositoryError' as PurchasingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Vendor
const toDomainVendor = (prismaVendor: any): Vendor => ({
  id: prismaVendor.id,
  userId: prismaVendor.userId,
  name: prismaVendor.name,
  email: prismaVendor.email ?? undefined,
  balance: Number(prismaVendor.balance),
  createdAt: prismaVendor.createdAt,
  updatedAt: prismaVendor.updatedAt,
})

/**
 * Create a new vendor in the database.
 */
export const createVendor = (vendor: Omit<Vendor, 'id' | 'balance' | 'createdAt' | 'updatedAt'>): Promise<Result<Vendor>> => {
  const action = prisma.vendor.create({
    data: {
      userId: vendor.userId,
      name: vendor.name,
      email: vendor.email,
      balance: 0, // initial balance
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainVendor(result.value))
      : result
  )
}

/**
 * Find a vendor by ID and user ID (ensures isolation).
 */
export const findVendorById = (userId: string, vendorId: string): Promise<Result<Vendor | null>> => {
  const action = prisma.vendor.findFirst({
    where: { id: vendorId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainVendor(result.value) : null)
      : result
  )
}

/**
 * List all vendors for a user.
 */
export const listVendors = (userId: string): Promise<Result<Vendor[]>> => {
  const action = prisma.vendor.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainVendor))
      : result
  )
}

/**
 * Update vendor balance by adding an amount (positive or negative).
 * This is a specialized function for updating the subsidiary balance.
 * If a transaction client is provided, the operation will be part of that transaction.
 */
export const updateVendorBalance = (
  userId: string,
  vendorId: string,
  amountDelta: number,
  tx?: Prisma.TransactionClient
): Promise<Result<Vendor>> => {
  const client = tx ?? prisma
  const action = client.vendor.update({
    where: { id: vendorId, userId },
    data: {
      balance: { increment: amountDelta },
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainVendor(result.value))
      : result
  )
}