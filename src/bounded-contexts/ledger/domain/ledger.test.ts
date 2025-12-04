import { describe, it, expect } from 'vitest'
import {
  validateAccountCode,
  validateAccountName,
  validateAmount,
  validateJournalEntryBalanced,
  validateJournalEntryHasLines,
  validateJournalEntry,
  AccountType,
  NormalBalance,
  JournalLineSide,
  type JournalLine,
} from './ledger'

describe('Ledger Domain Validation Functions', () => {
  describe('validateAccountCode', () => {
    it('should accept a valid numeric account code with optional dot', () => {
      const result = validateAccountCode('101')
      expect(result).toEqual({ isSuccess: true, value: '101' })
    })

    it('should accept a valid numeric account code with decimal', () => {
      const result = validateAccountCode('201.1')
      expect(result).toEqual({ isSuccess: true, value: '201.1' })
    })

    it('should trim whitespace', () => {
      const result = validateAccountCode('  301  ')
      expect(result).toEqual({ isSuccess: true, value: '301' })
    })

    it('should reject non-numeric characters', () => {
      const result = validateAccountCode('abc')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Account code must be numeric/)
      }
    })

    it('should reject codes longer than 20 characters', () => {
      const longCode = '123456789012345678901'
      const result = validateAccountCode(longCode)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/max 20 chars/)
      }
    })

    it('should reject empty string', () => {
      const result = validateAccountCode('')
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateAccountName', () => {
    it('should accept a valid account name', () => {
      const result = validateAccountName('Cash')
      expect(result).toEqual({ isSuccess: true, value: 'Cash' })
    })

    it('should trim whitespace', () => {
      const result = validateAccountName('  Accounts Receivable  ')
      expect(result).toEqual({ isSuccess: true, value: 'Accounts Receivable' })
    })

    it('should reject empty name after trim', () => {
      const result = validateAccountName('   ')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/between 1 and 100 characters/)
      }
    })

    it('should reject names longer than 100 characters', () => {
      const longName = 'A'.repeat(101)
      const result = validateAccountName(longName)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateAmount', () => {
    it('should accept a positive amount with two decimal places', () => {
      const result = validateAmount(123.45)
      expect(result).toEqual({ isSuccess: true, value: 123.45 })
    })

    it('should accept an integer amount', () => {
      const result = validateAmount(500)
      expect(result).toEqual({ isSuccess: true, value: 500 })
    })

    it('should reject zero', () => {
      const result = validateAmount(0)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/positive/)
      }
    })

    it('should reject negative amounts', () => {
      const result = validateAmount(-10.5)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject amounts with more than two decimal places', () => {
      const result = validateAmount(123.456)
      expect(result.isSuccess).toBe(false)
    })

    it('should reject non-finite numbers', () => {
      const result = validateAmount(Infinity)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateJournalEntryBalanced', () => {
    it('should accept a balanced journal entry (debits = credits)', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 100, side: JournalLineSide.Debit },
        { accountId: '2', amount: 100, side: JournalLineSide.Credit },
      ]
      const result = validateJournalEntryBalanced(lines)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value).toBe(lines)
      }
    })

    it('should reject an unbalanced journal entry (debits != credits)', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 100, side: JournalLineSide.Debit },
        { accountId: '2', amount: 99, side: JournalLineSide.Credit },
      ]
      const result = validateJournalEntryBalanced(lines)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Debits.*do not equal credits/)
      }
    })

    it('should allow a small floating-point difference within tolerance', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 100.001, side: JournalLineSide.Debit },
        { accountId: '2', amount: 100.001, side: JournalLineSide.Credit },
      ]
      const result = validateJournalEntryBalanced(lines)
      expect(result.isSuccess).toBe(true)
    })

    it('should sum multiple debit and credit lines', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 50, side: JournalLineSide.Debit },
        { accountId: '2', amount: 30, side: JournalLineSide.Debit },
        { accountId: '3', amount: 80, side: JournalLineSide.Credit },
      ]
      const result = validateJournalEntryBalanced(lines)
      expect(result.isSuccess).toBe(true)
    })
  })

  describe('validateJournalEntryHasLines', () => {
    it('should accept at least two lines', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 100, side: JournalLineSide.Debit },
        { accountId: '2', amount: 100, side: JournalLineSide.Credit },
      ]
      const result = validateJournalEntryHasLines(lines)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value).toBe(lines)
      }
    })

    it('should reject empty lines array', () => {
      const lines: JournalLine[] = []
      const result = validateJournalEntryHasLines(lines)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/at least two lines/)
      }
    })

    it('should reject single line', () => {
      const lines: JournalLine[] = [
        { accountId: '1', amount: 100, side: JournalLineSide.Debit },
      ]
      const result = validateJournalEntryHasLines(lines)
      expect(result.isSuccess).toBe(false)
    })
  })

  describe('validateJournalEntry', () => {
    it('should accept a valid journal entry', () => {
      const entry = {
        description: 'Paid rent',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: '1', amount: 500, side: JournalLineSide.Debit },
          { accountId: '2', amount: 500, side: JournalLineSide.Credit },
        ],
      }
      const result = validateJournalEntry(entry)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.description).toBe('Paid rent')
        expect(result.value.lines).toHaveLength(2)
      }
    })

    it('should reject entry with invalid description (empty)', () => {
      const entry = {
        description: '',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: '1', amount: 500, side: JournalLineSide.Debit },
          { accountId: '2', amount: 500, side: JournalLineSide.Credit },
        ],
      }
      const result = validateJournalEntry(entry)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Description must be between/)
      }
    })

    it('should reject entry with invalid date', () => {
      const entry = {
        description: 'Valid',
        date: new Date('invalid'),
        lines: [
          { accountId: '1', amount: 500, side: JournalLineSide.Debit },
          { accountId: '2', amount: 500, side: JournalLineSide.Credit },
        ],
      }
      const result = validateJournalEntry(entry)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Date must be a valid date/)
      }
    })

    it('should reject entry with unbalanced lines', () => {
      const entry = {
        description: 'Unbalanced',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: '1', amount: 600, side: JournalLineSide.Debit },
          { accountId: '2', amount: 500, side: JournalLineSide.Credit },
        ],
      }
      const result = validateJournalEntry(entry)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/Debits.*do not equal credits/)
      }
    })

    it('should reject entry with insufficient lines', () => {
      const entry = {
        description: 'Only one line',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: '1', amount: 500, side: JournalLineSide.Debit },
        ],
      }
      const result = validateJournalEntry(entry)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/at least two lines/)
      }
    })
  })
})