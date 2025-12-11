import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma, User } from '@/prisma/client'
import { DEFAULT_ACCOUNTS } from '@/bounded-contexts/ledger/domain/defaultAccounts'

/**
 * Create a new user along with the default Chart of Accounts in a single transaction.
 * This ensures atomicity: either both user and accounts are created, or neither.
 */
export const createUserWithDefaultAccounts = async (username: string): Promise<Result<User>> => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the user
      const user = await tx.user.create({
        data: { username }
      })

      // 2. Create all default accounts for this user
      for (const account of DEFAULT_ACCOUNTS) {
        await tx.account.create({
          data: {
            userId: user.id,
            code: account.code,
            name: account.name,
            type: account.type,
            normalBalance: account.normalBalance,
          }
        })
      }

      return user
    })

    return Success(result)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        // Unique constraint violation (username)
        return Failure(
          InfrastructureFailure(
            'DuplicateKey',
            'Username already exists'
          )
        )
      }
      // Other known Prisma errors
      return Failure(
        InfrastructureFailure(
          'DatabaseError',
          `Database error during user creation: ${e.message}`,
          e
        )
      )
    }
    // Unknown error
    return Failure(
      InfrastructureFailure(
        'DatabaseError',
        e.message || 'Unknown database error during user creation',
        e
      )
    )
  }
}