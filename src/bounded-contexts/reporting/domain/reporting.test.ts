import { describe, it, expect } from 'vitest'
import * as R from 'ramda'
import {
  AccountWithBalance,
  classifyAccountByType,
  isContraAccount,
  calculateAccountBalance,
  calculateNetIncome,
  validateDateRange,
  buildIncomeStatement,
  buildBalanceSheet,
  buildStatementOfOwnersEquity,
  buildStatementOfCashFlows,
  AccountTypeEnum,
  NormalBalanceEnum,
  JournalLineSideEnum,
} from './reporting'
import { Success, Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { ReportingDomainSubtype } from './errors'
import { JournalLine } from '@/bounded-contexts/ledger/domain/ledger'

// --- Test Data Factory ---

const createAccount = (overrides: Partial<AccountWithBalance>): AccountWithBalance => ({
  id: 'acc-1',
  userId: 'user-1',
  code: '101',
  name: 'Cash',
  type: 'Asset',
  normalBalance: 'Debit',
  balance: 1000,
  ...overrides,
})

const createJournalLine = (overrides: Partial<any>): any => ({
  accountId: 'acc-1',
  amount: 100,
  side: 'Debit',
  ...overrides,
})

// --- Test Suite ---

describe('Reporting Domain Functions', () => {
  describe('classifyAccountByType', () => {
    it('returns the account type', () => {
      const account = createAccount({ type: AccountTypeEnum.Asset })
      expect(classifyAccountByType(account)).toBe('Asset')
    })

    it('works for all account types', () => {
      const types = Object.values(AccountTypeEnum)
      types.forEach((type) => {
        const account = createAccount({ type })
        expect(classifyAccountByType(account)).toBe(type)
      })
    })
  })

  describe('isContraAccount', () => {
    it('returns true for account with "accumulated" in name', () => {
      const account = createAccount({ name: 'Accumulated Depreciation' })
      expect(isContraAccount(account)).toBe(true)
    })

    it('returns true for account with "depreciation" in name', () => {
      const account = createAccount({ name: 'Depreciation Expense' })
      expect(isContraAccount(account)).toBe(true)
    })

    it('returns false for regular account', () => {
      const account = createAccount({ name: 'Cash' })
      expect(isContraAccount(account)).toBe(false)
    })
  })

  describe('calculateAccountBalance', () => {
    const account = createAccount({
      id: 'acc-1',
      normalBalance: 'Debit',
    })

    it('sums debit lines and subtracts credits for debit normal balance', () => {
      const lines = [
        createJournalLine({ amount: 500, side: 'Debit' }),
        createJournalLine({ amount: 200, side: 'Credit' }),
        createJournalLine({ amount: 300, side: 'Debit' }),
      ]
      expect(calculateAccountBalance(account, lines)).toBe(600) // 500+300 -200 = 600
    })

    it('sums credit lines and subtracts debits for credit normal balance', () => {
      const creditAccount = createAccount({ normalBalance: 'Credit' })
      const lines = [
        createJournalLine({ amount: 700, side: 'Credit' }),
        createJournalLine({ amount: 300, side: 'Debit' }),
      ]
      expect(calculateAccountBalance(creditAccount, lines)).toBe(400) // 700 - 300
    })

    it('ignores lines for other accounts', () => {
      const lines = [
        createJournalLine({ accountId: 'acc-other', amount: 999 }),
        createJournalLine({ accountId: 'acc-1', amount: 100, side: 'Debit' }),
      ]
      expect(calculateAccountBalance(account, lines)).toBe(100)
    })

    it('returns zero for no matching lines', () => {
      const lines = [createJournalLine({ accountId: 'other' })]
      expect(calculateAccountBalance(account, lines)).toBe(0)
    })
  })

  describe('calculateNetIncome', () => {
    it('sums revenue balances minus expense balances', () => {
      const revenues = [
        createAccount({ type: 'Revenue', balance: 1000 }),
        createAccount({ type: 'Revenue', balance: 500 }),
      ]
      const expenses = [
        createAccount({ type: 'Expense', balance: 300 }),
        createAccount({ type: 'Expense', balance: 200 }),
      ]
      expect(calculateNetIncome(revenues, expenses)).toBe(1000) // (1000+500) - (300+200)
    })

    it('handles negative net income', () => {
      const revenues = [createAccount({ type: 'Revenue', balance: 400 })]
      const expenses = [createAccount({ type: 'Expense', balance: 700 })]
      expect(calculateNetIncome(revenues, expenses)).toBe(-300)
    })

    it('handles empty arrays', () => {
      expect(calculateNetIncome([], [])).toBe(0)
      expect(calculateNetIncome([], [createAccount({ type: 'Expense', balance: 50 })])).toBe(-50)
    })
  })

  describe('validateDateRange', () => {
    it('returns Success for valid date range', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-12-31')
      const result = validateDateRange(start, end)
      expect(result).toEqual(Success({ startDate: start, endDate: end }))
    })

    it('returns Failure when start > end', () => {
      const start = new Date('2025-12-31')
      const end = new Date('2025-01-01')
      const result = validateDateRange(start, end)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect((result.error as any).subtype).toBe('InvalidDateRange')
      }
    })
  })

  describe('buildIncomeStatement', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-12-31')

    it('builds income statement with revenues and expenses', () => {
      const accounts = [
        createAccount({ type: 'Revenue', code: '401', name: 'Service Revenue', balance: 1500 }),
        createAccount({ type: 'Expense', code: '501', name: 'Rent', balance: 800 }),
        createAccount({ type: 'Expense', code: '502', name: 'Supplies', balance: 200 }),
        createAccount({ type: 'Asset', code: '101', name: 'Cash', balance: 1000 }), // ignored
      ]
      const result = buildIncomeStatement(accounts, start, end)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        const stmt = result.value
        expect(stmt.period).toEqual({ startDate: start, endDate: end })
        expect(stmt.revenues).toHaveLength(1)
        expect(stmt.revenues[0].accountCode).toBe('401')
        expect(stmt.revenueTotal).toBe(1500)
        expect(stmt.expenses).toHaveLength(2)
        expect(stmt.expenseTotal).toBe(1000)
        expect(stmt.netIncome).toBe(500)
      }
    })

    it('handles empty data', () => {
      const result = buildIncomeStatement([], start, end)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        const stmt = result.value
        expect(stmt.revenues).toHaveLength(0)
        expect(stmt.expenses).toHaveLength(0)
        expect(stmt.revenueTotal).toBe(0)
        expect(stmt.expenseTotal).toBe(0)
        expect(stmt.netIncome).toBe(0)
      }
    })

    it('fails on invalid date range', () => {
      const accounts = [createAccount({ type: 'Revenue', balance: 100 })]
      const result = buildIncomeStatement(accounts, end, start) // reversed
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('buildBalanceSheet', () => {
    const asOf = new Date('2025-12-31')

    it('builds balance sheet with correct totals', () => {
      const accounts = [
        createAccount({ type: 'Asset', code: '101', name: 'Cash', balance: 2000 }),
        createAccount({ type: 'Asset', code: '191', name: 'Equipment', balance: 5000 }),
        createAccount({ type: 'Asset', code: '191.1', name: 'Accumulated Depreciation', balance: 1000 }),
        createAccount({ type: 'Liability', code: '201', name: 'Accounts Payable', balance: 1500 }),
        createAccount({ type: 'Equity', code: '301', name: 'Owner Capital', balance: 4500, normalBalance: 'Credit' }),
      ]
      const result = buildBalanceSheet(accounts, asOf)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        const bs = result.value
        expect(bs.asOfDate).toEqual(asOf)
        expect(bs.assets).toHaveLength(3)
        // Contra‑asset should be negative
        expect(bs.assets.find((a) => a.accountCode === '191.1')?.amount).toBe(-1000)
        expect(bs.assetTotal).toBe(6000) // 2000 + 5000 - 1000
        expect(bs.liabilities).toHaveLength(1)
        expect(bs.liabilityTotal).toBe(1500)
        expect(bs.equity).toHaveLength(2)
        expect(bs.equityTotal).toBe(4500)
        const capitalLine = bs.equity.find((line) => line.accountCode === '301')
        expect(capitalLine).toBeDefined()
        expect(capitalLine?.amount).toBe(4500)
        const retainedLine = bs.equity.find((line) => line.accountCode === '399')
        expect(retainedLine).toBeDefined()
        expect(retainedLine?.amount).toBe(0)
        // Equation: 6000 = 1500 + 4500
      }
    })

    it('fails when accounting equation is violated', () => {
      const accounts = [
        createAccount({ type: 'Asset', balance: 1000 }),
        createAccount({ type: 'Liability', balance: 200 }),
        createAccount({ type: 'Equity', balance: 300 }),
      ] // 1000 != 200+300 (500)
      const result = buildBalanceSheet(accounts, asOf)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.type).toBe('DomainFailure')
        expect((result.error as any).subtype).toBe('AccountingEquationViolation')
      }
    })

    it('passes within tolerance', () => {
      const accounts = [
        createAccount({ type: 'Asset', balance: 1000.005 }),
        createAccount({ type: 'Liability', balance: 500 }),
        createAccount({ type: 'Equity', balance: 500.005, normalBalance: 'Credit' }),
      ]
      const result = buildBalanceSheet(accounts, asOf)
      expect(result.isSuccess).toBe(true) // diff = 0.01, within tolerance
    })
  })

  describe('buildStatementOfOwnersEquity', () => {
    const period = { startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31') }

    it('computes statement correctly', () => {
      const beginningCapital = 10000
      const contributionsDuringPeriod = 0 // v1 not tracked
      const drawingsDuringPeriod = 2000
      const netIncome = 5000
      const result = buildStatementOfOwnersEquity(
        beginningCapital,
        contributionsDuringPeriod,
        drawingsDuringPeriod,
        netIncome,
        period
      )
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        const stmt = result.value
        expect(stmt.period).toEqual(period)
        expect(stmt.beginningCapital).toBe(10000)
        expect(stmt.additionalContributions).toBe(0) // v1 not tracked
        expect(stmt.netIncome).toBe(5000)
        expect(stmt.drawings).toBe(2000)
        expect(stmt.endingCapital).toBe(13000) // 10000 + 0 + 5000 - 2000
      }
    })
  })

  describe('buildStatementOfCashFlows', () => {
    const start = new Date('2025-01-01')
    const end = new Date('2025-12-31')

    it('returns placeholder success (to be refined)', () => {
      const cashAccount = createAccount({ type: 'Asset', balance: 500 })
      const cashLines: JournalLine[] = []
      const result = buildStatementOfCashFlows(cashAccount, cashLines, start, end)
      expect(result.isSuccess).toBe(true)
      // In v1 this is a placeholder; we just verify it doesn't crash.
    })

    it('validates date range', () => {
      const cashAccount = createAccount({ balance: 0 })
      const result = buildStatementOfCashFlows(cashAccount, [], end, start)
      expect(result.isSuccess).toBe(false)
    })
  })
})