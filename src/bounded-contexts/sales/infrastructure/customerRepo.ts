import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Customer } from '../domain/sales'
import { SalesInfrastructureSubtype } from '../domain/errors'
import { fromNullable, getOrElse } from '@/common/types/option'

const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Duplicate key (maybe unique constraint on customer name per user? Not defined, but could be)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey' as SalesInfrastructureSubtype,
            'Customer name might already exist for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'CustomerRepositoryError' as SalesInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'CustomerRepositoryError' as SalesInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Customer
const toDomainCustomer = (prismaCustomer: any): Customer => ({
  id: prismaCustomer.id,
  userId: prismaCustomer.userId,
  name: prismaCustomer.name,
  email: prismaCustomer.email ?? undefined,
  balance: Number(prismaCustomer.balance),
  createdAt: prismaCustomer.createdAt,
  updatedAt: prismaCustomer.updatedAt,
})

/**
 * Create a new customer in the database.
 */
export const createCustomer = (customer: Omit<Customer, 'id' | 'balance' | 'createdAt' | 'updatedAt'>): Promise<Result<Customer>> => {
  const action = prisma.customer.create({
    data: {
      userId: customer.userId,
      name: customer.name,
      email: customer.email,
      balance: 0, // initial balance
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainCustomer(result.value))
      : result
  )
}

/**
 * Find a customer by ID and user ID (ensures isolation).
 */
export const findCustomerById = (userId: string, customerId: string): Promise<Result<Customer | null>> => {
  const action = prisma.customer.findFirst({
    where: { id: customerId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainCustomer(result.value) : null)
      : result
  )
}

/**
 * List all customers for a user.
 */
export const listCustomers = (userId: string): Promise<Result<Customer[]>> => {
  const action = prisma.customer.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainCustomer))
      : result
  )
}

/**
 * Update customer balance by adding an amount (positive or negative).
 * This is a specialized function for updating the subsidiary balance.
 */
export const updateCustomerBalance = (userId: string, customerId: string, amountDelta: number): Promise<Result<Customer>> => {
  const action = prisma.customer.update({
    where: { id: customerId, userId },
    data: {
      balance: { increment: amountDelta },
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainCustomer(result.value))
      : result
  )
}