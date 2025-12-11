import { prisma } from '@/common/infrastructure/db'
import { Result, Success, Failure } from '@/common/types/result'
import { InfrastructureFailure } from '@/common/types/errors'
import { Prisma } from '@/prisma/client'
import { ReportingInfrastructureSubtype } from '../domain/errors'
import {
  AccountWithBalance,
  AccountType,
  NormalBalance,
  StatementLine,
  CashFlowActivity,
} from '../domain/reporting'
import { JournalLine } from '@/bounded-contexts/ledger/domain/ledger'

// --- Helper: safe DB call with error mapping ---
const safeDbCall = async <T>(promise: Promise<T>): Promise<Result<T>> => {
  try {
    const data = await promise
    return Success(data)
  } catch (e: any) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      return Failure(
        InfrastructureFailure(
          'ReportingRepositoryError' as ReportingInfrastructureSubtype,
          `Database error (code ${e.code}): ${e.message}`,
          e
        )
      )
    }
    // unknown error
    const errorMessage = e?.message || 'Unknown database error'
    return Failure(
      InfrastructureFailure(
        'ReportingRepositoryError' as ReportingInfrastructureSubtype,
        errorMessage,
        e
      )
    )
  }
}

// --- Mappers ---

const toAccountWithBalance = (prismaAccount: any, balance: number): AccountWithBalance => ({
  id: prismaAccount.id,
  userId: prismaAccount.userId,
  code: prismaAccount.code,
  name: prismaAccount.name,
  type: prismaAccount.type as AccountType,
  normalBalance: prismaAccount.normalBalance as NormalBalance,
  balance,
})

const toJournalLine = (prismaLine: any): JournalLine => ({
  accountId: prismaLine.accountId,
  amount: Number(prismaLine.amount),
  side: prismaLine.side,
})

// --- Repository Functions ---

/**
 * Fetch all accounts for a user with their cumulative balances as of a given date.
 * The balance is computed by summing journal lines up to and including the asOfDate.
 */
export const getAccountsWithCumulativeBalances = async (
  userId: string,
  asOfDate: Date
): Promise<Result<AccountWithBalance[]>> => {
  // 1. Fetch all accounts for the user
  const accountsResult = await safeDbCall(
    prisma.account.findMany({
      where: { userId },
      orderBy: { code: 'asc' },
    })
  )
  if (!accountsResult.isSuccess) return accountsResult

  // 2. For each account, compute balance by aggregating its journal lines up to asOfDate
  const accountsWithBalances = await Promise.all(
    accountsResult.value.map(async (acc) => {
      const aggregate = await prisma.journalLine.aggregate({
        where: {
          accountId: acc.id,
          journalEntry: {
            date: { lte: asOfDate },
          },
        },
        _sum: { amount: true },
      })
      const total = aggregate._sum.amount || 0
      // Balance sign depends on normal balance and side.
      // We'll compute using domain logic later; for now, we can store the raw sum of amounts
      // where debit lines are positive, credit lines negative? Actually, the domain function
      // calculateAccountBalance expects lines and will compute correctly.
      // But we need to return a signed balance according to normal balance.
      // Let's compute by fetching lines and using domain function.
      // However, we can compute via raw SQL or in memory. For simplicity, we'll fetch lines.
      const lines = await prisma.journalLine.findMany({
        where: {
          accountId: acc.id,
          journalEntry: {
            date: { lte: asOfDate },
          },
        },
        select: { amount: true, side: true },
      })
      let balance = 0
      for (const line of lines) {
        const amount = Number(line.amount)
        if (line.side === 'Debit') {
          balance += acc.normalBalance === 'Debit' ? amount : -amount
        } else {
          balance += acc.normalBalance === 'Credit' ? amount : -amount
        }
      }
      return toAccountWithBalance(acc, balance)
    })
  )
  return Success(accountsWithBalances)
}

/**
 * Fetch accounts with their period‑specific balances (change during the date range).
 * This is suitable for income statement where we need revenue/expense activity within a period.
 * Returns accounts with balances equal to the net change during the period.
 */
export const getAccountsWithPeriodBalances = async (
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<AccountWithBalance[]>> => {
  const accountsResult = await safeDbCall(
    prisma.account.findMany({
      where: { userId },
      orderBy: { code: 'asc' },
    })
  )
  if (!accountsResult.isSuccess) return accountsResult

  const accountsWithBalances = await Promise.all(
    accountsResult.value.map(async (acc) => {
      const lines = await prisma.journalLine.findMany({
        where: {
          accountId: acc.id,
          journalEntry: {
            date: { gte: startDate, lte: endDate },
          },
        },
        select: { amount: true, side: true },
      })
      let periodBalance = 0
      for (const line of lines) {
        const amount = Number(line.amount)
        if (line.side === 'Debit') {
          periodBalance += acc.normalBalance === 'Debit' ? amount : -amount
        } else {
          periodBalance += acc.normalBalance === 'Credit' ? amount : -amount
        }
      }
      return toAccountWithBalance(acc, periodBalance)
    })
  )
  return Success(accountsWithBalances)
}

/**
 * Fetch journal lines for a specific cash account within a date range.
 * Used for building the statement of cash flows.
 */
export const getCashJournalLines = async (
  userId: string,
  cashAccountId: string,
  startDate: Date,
  endDate: Date
): Promise<Result<JournalLine[]>> => {
  const result = await safeDbCall(
    prisma.journalLine.findMany({
      where: {
        accountId: cashAccountId,
        journalEntry: {
          userId,
          date: { gte: startDate, lte: endDate },
        },
      },
      include: {
        journalEntry: true, // need the whole entry to classify cash flow activity
      },
      orderBy: { journalEntry: { date: 'asc' } },
    })
  )
  if (!result.isSuccess) return result

  const lines = result.value.map(toJournalLine)
  return Success(lines)
}

/**
 * Find the cash account (default account code '101') for a user.
 */
export const findCashAccount = async (
  userId: string
): Promise<Result<AccountWithBalance | null>> => {
  const result = await safeDbCall(
    prisma.account.findFirst({
      where: { userId, code: '101' },
    })
  )
  if (!result.isSuccess) return result
  if (!result.value) return Success(null)
  // We need the balance as of now? For cash flow, we might need up to a date.
  // This function returns the account without balance; we can compute later.
  // For simplicity, return with zero balance.
  return Success(toAccountWithBalance(result.value, 0))
}

/**
 * Find an account by its code for a given user, with its cumulative balance as of a specific date.
 * If asOfDate is provided, the balance is computed up to that date; otherwise, balance is 0.
 */
export const findAccountByCode = async (
  userId: string,
  code: string,
  asOfDate?: Date
): Promise<Result<AccountWithBalance | null>> => {
  const accountResult = await safeDbCall(
    prisma.account.findFirst({
      where: { userId, code },
    })
  )
  if (!accountResult.isSuccess) return accountResult
  if (!accountResult.value) return Success(null)

  const account = accountResult.value
  let balance = 0
  if (asOfDate) {
    const lines = await prisma.journalLine.findMany({
      where: {
        accountId: account.id,
        journalEntry: {
          date: { lte: asOfDate },
        },
      },
      select: { amount: true, side: true },
    })
    for (const line of lines) {
      const amount = Number(line.amount)
      if (line.side === 'Debit') {
        balance += account.normalBalance === 'Debit' ? amount : -amount
      } else {
        balance += account.normalBalance === 'Credit' ? amount : -amount
      }
    }
  }
  return Success(toAccountWithBalance(account, balance))
}