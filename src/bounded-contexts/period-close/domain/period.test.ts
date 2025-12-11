import { describe, it, expect } from 'vitest'
import {
  validatePeriodName,
  validatePeriodDateRange,
  validatePeriodIsOpen,
  validatePeriodCanBeClosed,
  validateManualJournalEntry,
  type Period,
  type ManualJournalEntryInput,
} from './period'

describe('Period Domain Validation Functions', () => {
  describe('validatePeriodName', () => {
    it('should accept a valid period name (1-100 characters)', () => {
      const result = validatePeriodName('January 2025')
      expect(result).toEqual({ isSuccess: true, value: 'January 2025' })
    })

    it('should trim whitespace', () => {
      const result = validatePeriodName('  Q1 2025  ')
      expect(result).toEqual({ isSuccess: true, value: 'Q1 2025' })
    })

    it('should reject empty name after trim', () => {
      const result = validatePeriodName('   ')
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('InvalidPeriodName')
        expect(result.error.message).toMatch(/between 1 and 100 characters/)
      }
    })

    it('should reject names longer than 100 characters', () => {
      const longName = 'A'.repeat(101)
      const result = validatePeriodName(longName)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('InvalidPeriodName')
      }
    })
  })

  describe('validatePeriodDateRange', () => {
    it('should succeed when startDate is before endDate', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-01-31')
      const result = validatePeriodDateRange(start, end)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value.startDate).toBe(start)
        expect(result.value.endDate).toBe(end)
      }
    })

    it('should fail when startDate equals endDate', () => {
      const start = new Date('2025-01-01')
      const end = new Date('2025-01-01')
      const result = validatePeriodDateRange(start, end)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('InvalidPeriodDateRange')
        expect(result.error.message).toMatch(/Start date must be before end date/)
      }
    })

    it('should fail when startDate is after endDate', () => {
      const start = new Date('2025-01-31')
      const end = new Date('2025-01-01')
      const result = validatePeriodDateRange(start, end)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('InvalidPeriodDateRange')
      }
    })
  })

  describe('validatePeriodIsOpen', () => {
    const openPeriod: Period = {
      id: 'period1',
      userId: 'user1',
      name: 'January 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-01-31'),
      status: 'Open',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const closedPeriod: Period = {
      ...openPeriod,
      status: 'Closed',
      closedAt: new Date(),
    }

    it('should succeed for open period', () => {
      const result = validatePeriodIsOpen(openPeriod)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value).toBe(openPeriod)
      }
    })

    it('should fail for closed period', () => {
      const result = validatePeriodIsOpen(closedPeriod)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('PeriodAlreadyClosed')
        expect(result.error.message).toMatch(/Period January 2025 is already closed/)
      }
    })
  })

  describe('validatePeriodCanBeClosed', () => {
    const openPeriod: Period = {
      id: 'period1',
      userId: 'user1',
      name: 'January 2025',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-01-31'),
      status: 'Open',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const closedPeriod: Period = {
      ...openPeriod,
      status: 'Closed',
      closedAt: new Date(),
    }

    it('should succeed for open period', () => {
      const result = validatePeriodCanBeClosed(openPeriod)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value).toBe(openPeriod)
      }
    })

    it('should fail for already closed period', () => {
      const result = validatePeriodCanBeClosed(closedPeriod)
      expect(result.isSuccess).toBe(false)
      if (!result.isSuccess) {
        expect(result.error.subtype).toBe('PeriodAlreadyClosed')
      }
    })
  })

  describe('validateManualJournalEntry', () => {
    it('should currently succeed for any input (placeholder)', () => {
      const entry: ManualJournalEntryInput = {
        description: 'Adjusting entry',
        date: new Date('2025-01-15'),
        lines: [
          { accountId: 'acc1', amount: 100, side: 'Debit' },
          { accountId: 'acc2', amount: 100, side: 'Credit' },
        ],
      }
      const result = validateManualJournalEntry(entry)
      expect(result.isSuccess).toBe(true)
      if (result.isSuccess) {
        expect(result.value).toBe(entry)
      }
    })
  })
})