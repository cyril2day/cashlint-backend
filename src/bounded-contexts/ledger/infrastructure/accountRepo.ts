import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { Account, AccountType, NormalBalance } from '../domain/ledger'
import { LedgerInfrastructureSubtype } from '../domain/errors'
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
            'DuplicateKey' as LedgerInfrastructureSubtype,
            'Account code already exists for this user.'
          )
        )
      }
      // other known errors
      return Failure(
        InfrastructureFailure(
          'AccountRepositoryError' as LedgerInfrastructureSubtype,
          `Database error: ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = getOrElse('Unknown database error')(fromNullable(e?.message))
    return Failure(
      InfrastructureFailure(
        'AccountRepositoryError' as LedgerInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// Mapper from Prisma model to domain Account
const toDomainAccount = (prismaAccount: any): Account => ({
  id: prismaAccount.id,
  userId: prismaAccount.userId,
  code: prismaAccount.code,
  name: prismaAccount.name,
  type: prismaAccount.type as AccountType,
  normalBalance: prismaAccount.normalBalance as NormalBalance,
  createdAt: prismaAccount.createdAt,
  updatedAt: prismaAccount.updatedAt,
})

/**
 * Create a new account in the database.
 */
export const createAccount = (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Account>> => {
  const action = prisma.account.create({
    data: {
      userId: account.userId,
      code: account.code,
      name: account.name,
      type: account.type,
      normalBalance: account.normalBalance,
    },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(toDomainAccount(result.value))
      : result
  )
}

/**
 * Find an account by ID and user ID (ensures isolation).
 */
export const findAccountById = (userId: string, accountId: string): Promise<Result<Account | null>> => {
  const action = prisma.account.findFirst({
    where: { id: accountId, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainAccount(result.value) : null)
      : result
  )
}

/**
 * Find an account by code and user ID.
 */
export const findAccountByCode = (userId: string, code: string): Promise<Result<Account | null>> => {
  const action = prisma.account.findFirst({
    where: { code, userId },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value ? toDomainAccount(result.value) : null)
      : result
  )
}

/**
 * List all accounts for a user.
 */
export const listAccounts = (userId: string): Promise<Result<Account[]>> => {
  const action = prisma.account.findMany({
    where: { userId },
    orderBy: { code: 'asc' },
  })
  return safeDbCall(action).then(result =>
    result.isSuccess
      ? Success(result.value.map(toDomainAccount))
      : result
  )
}