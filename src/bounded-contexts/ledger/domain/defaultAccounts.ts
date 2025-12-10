/**
 * Default Chart of Accounts for Cashlint (as per specification)
 * Account codes are immutable; names can be renamed by the user.
 */

import { AccountType, NormalBalance } from './ledger'

export type DefaultAccount = {
  readonly code: string
  readonly name: string
  readonly type: AccountType
  readonly normalBalance: NormalBalance
}

export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  // Assets (Debit)
  { code: '101', name: 'Cash', type: 'Asset', normalBalance: 'Debit' },
  { code: '111', name: 'Accounts Receivable', type: 'Asset', normalBalance: 'Debit' },
  { code: '191', name: 'Equipment / Fixed Assets', type: 'Asset', normalBalance: 'Debit' },
  { code: '191.1', name: 'Accumulated Depreciation – Equipment', type: 'Asset', normalBalance: 'Credit' }, // contra-asset
  { code: '141', name: 'Supplies', type: 'Asset', normalBalance: 'Debit' },
  { code: '145', name: 'Prepaid Insurance', type: 'Asset', normalBalance: 'Debit' },

  // Liabilities (Credit)
  { code: '201', name: 'Accounts Payable', type: 'Liability', normalBalance: 'Credit' },
  { code: '251', name: 'Notes Payable', type: 'Liability', normalBalance: 'Credit' },
  { code: '255', name: 'Unearned Revenue', type: 'Liability', normalBalance: 'Credit' },

  // Equity
  { code: '301', name: 'Owner, Capital', type: 'Equity', normalBalance: 'Credit' },
  { code: '302', name: 'Owner, Drawing', type: 'Equity', normalBalance: 'Debit' },

  // Revenue (Credit)
  { code: '401', name: 'Service Revenue', type: 'Revenue', normalBalance: 'Credit' },

  // Expenses (Debit)
  { code: '501', name: 'Salaries Expense / Subcontractor Fee', type: 'Expense', normalBalance: 'Debit' },
  { code: '502', name: 'Rent Expense', type: 'Expense', normalBalance: 'Debit' },
  { code: '503', name: 'Office Supplies Expense', type: 'Expense', normalBalance: 'Debit' },
  { code: '504', name: 'Training Expense', type: 'Expense', normalBalance: 'Debit' },
  { code: '505', name: 'Interest Expense / Late Fees', type: 'Expense', normalBalance: 'Debit' },
  { code: '506', name: 'Repairs & Maintenance Expense', type: 'Expense', normalBalance: 'Debit' },
] as const

// Helper to get a specific default account by code
export const getDefaultAccount = (code: string): DefaultAccount | undefined =>
  DEFAULT_ACCOUNTS.find(acc => acc.code === code)

// Commonly used account codes (for easy reference)
export const DEFAULT_ACCOUNT_CODES = {
  CASH: '101',
  ACCOUNTS_RECEIVABLE: '111',
  ACCOUNTS_PAYABLE: '201',
  NOTES_PAYABLE: '251',
  UNEARNED_REVENUE: '255',
  OWNER_CAPITAL: '301',
  OWNER_DRAWING: '302',
  SERVICE_REVENUE: '401',
  SALARIES_EXPENSE: '501',
  INTEREST_EXPENSE: '505',
} as const

// Type of the codes object for type safety
export type DefaultAccountCode = typeof DEFAULT_ACCOUNT_CODES[keyof typeof DEFAULT_ACCOUNT_CODES]