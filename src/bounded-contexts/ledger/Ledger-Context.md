# Ledger Bounded Context

## Overview

The **Ledger** bounded context is the core of the Cashlint accrual‑based accounting system. It implements double‑entry bookkeeping, ensuring that every financial transaction is recorded as balanced journal entries and that accounts are updated correctly. This context provides the foundational accounting model upon which all other bounded contexts (Sales, Purchasing, PeriodClose) depend.

## Purpose & Business Value

Double‑entry accounting is the backbone of accurate financial reporting. The Ledger context guarantees:

1. **Journal Entry Integrity**: Every journal entry must have equal total debits and total credits.
2. **Account Management**: Creation and validation of accounts (Assets, Liabilities, Equity, Revenue, Expenses) with proper normal balances.
3. **Audit Trail**: A complete, immutable record of all financial transactions.
4. **Balance Calculation**: The ability to compute account balances from posted journal entries.

Without this context, the system could not produce reliable financial statements (Income Statement, Balance Sheet, etc.) or enforce accounting principles.

## Key Concepts

### Account
An account is a record that summarizes increases and decreases in a specific financial item (e.g., Cash, Accounts Receivable, Service Revenue). Each account has:

- **Code**: A numeric identifier (e.g., “101” for Cash) that must be unique per user.
- **Name**: A human‑readable label (e.g., “Cash”).
- **Type**: One of `Asset`, `Liability`, `Equity`, `Revenue`, or `Expense`.
- **Normal Balance**: Either `Debit` or `Credit`, indicating which side increases the account.

### Journal Entry
A journal entry records a financial transaction. It consists of:

- **Description**: A brief explanation of the transaction.
- **Date**: The date the transaction occurred.
- **Lines**: Two or more journal lines, each referencing an account, an amount, and a side (`Debit` or `Credit`).

### Journal Line
A line within a journal entry that specifies:

- **Account**: The account being affected.
- **Amount**: A positive monetary value.
- **Side**: `Debit` or `Credit`.

### Double‑Entry Rule
For every journal entry, the sum of debit amounts must equal the sum of credit amounts.

## Bounded Context Boundaries

The Ledger context is the **core domain** of the Cashlint system. It is used by:

- **Sales Context**: Posts journal entries for invoices, cash sales, and customer deposits.
- **Purchasing Context**: Posts journal entries for vendor bills, loan payments, and cash expenses.
- **PeriodClose Context**: Posts manual adjusting journal entries.

The Ledger context does not know about the business rules of sales, purchasing, or period closing; it only ensures that the journal entries are balanced and reference valid accounts.

## Domain Model

### Aggregate Roots
1. **Account**: Enforces uniqueness of account codes per user and validates account type/normal‑balance consistency.
2. **JournalEntry**: Ensures the entry is balanced, has at least two lines, and references existing accounts.

### Value Objects
- `AccountCode`: Validates numeric format and length.
- `Money`: Positive decimal with up to two decimal places.
- `JournalLineSide`: `Debit` or `Credit`.

### Domain Events
- `AccountCreated`
- `JournalEntryPosted`

## Workflows

### 1. Create Account
**Command**: `CreateAccount`
**Steps**:
1. Validate account code (numeric, unique per user).
2. Validate account name, type, and normal balance.
3. Persist the account.
4. Return the created account.

**Errors**:
- `InvalidAccountCode`
- `DuplicateAccountCode`
- `InvalidAccountType`

### 2. Post Journal Entry
**Command**: `PostJournalEntry`
**Steps**:
1. Validate journal entry description, date, and lines (pure domain validation).
2. Ensure the entry is balanced (debits = credits).
3. Validate that each referenced account exists and belongs to the user.
4. Persist the journal entry and its lines in a single transaction.
5. Return the created journal entry.

**Errors**:
- `JournalEntryNotBalanced`
- `InsufficientLines`
- `AccountNotFound`
- `InvalidJournalEntryDate`

## Directory Structure

```
src/bounded-contexts/ledger/
├── domain/
│   ├── ledger.ts              # Account and JournalEntry types, validation logic
│   ├── defaultAccounts.ts     # Default Chart of Accounts definitions
│   ├── errors.ts              # Context‑specific error subtypes
│   └── ledger.test.ts         # Unit tests for domain logic
├── application/
│   ├── createAccountWorkflow.ts
│   ├── postJournalEntryWorkflow.ts
│   └── *.test.ts              # Workflow unit tests
├── infrastructure/
│   ├── accountRepo.ts         # Repository for Account aggregate
│   ├── journalEntryRepo.ts    # Repository for JournalEntry aggregate
│   └── *.test.ts              # Repository integration tests
└── Ledger-Context.md          (this file)
```

## Dependencies

### Internal Dependencies
- **Shared Types**: `Result<T, AppError>`, `AppError` subtypes, validation helpers.
- **Ramda**: Used for functional composition in validation.

### External Dependencies
- **Prisma Client**: For database persistence.

## API Routes

The context exposes the following HTTP endpoints (see `src/api/routes/ledger.ts`):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ledger/accounts` | Create a new account |
| GET  | `/api/ledger/accounts` | List accounts for a user |
| GET  | `/api/ledger/accounts/{accountId}` | Get an account by ID |
| POST | `/api/ledger/journal-entries` | Post a journal entry |
| GET  | `/api/ledger/journal-entries` | List journal entries for a user |
| GET  | `/api/ledger/journal-entries/{entryId}` | Get a journal entry by ID |
| GET  | `/api/ledger/health` | Health check |

## Error Handling

All operations return a `Result<T, AppError>` where errors are categorized as:

- **DomainFailure**: Business‑rule violations (e.g., unbalanced entry, duplicate account code).
- **InfrastructureFailure**: Database errors.
- **ApplicationFailure**: Request‑validation errors (e.g., missing fields).

Error mapping to HTTP status codes is done in the API layer (`errorMapper.ts`).

## Testing Strategy

### Unit Tests
- **Domain**: Test account‑code validation, journal‑entry balancing, and other pure calculations.
- **Workflows**: Mock dependencies to test the creation and posting flows.

### Integration Tests
- **API Routes**: Use `supertest` to verify endpoint behavior with a real database.
- **Repository**: Test database operations with a real test database.

### Key Test Scenarios
1. Account creation with duplicate code (same user, different user).
2. Posting a balanced journal entry.
3. Posting an unbalanced journal entry (expect failure).
4. Referencing a non‑existent account in a journal entry.

## How It Fits into the Cashlint System

The Ledger context is the **system of record** for all financial transactions. Every monetary event in the system eventually results in a journal entry posted through this context. It is the single source of truth for account balances and the foundation for all financial reporting.

## Future Enhancements

1. **Account Balances Caching**: Compute and cache account balances to avoid recalculating from all journal entries.
2. **Account Reconciliation**: Support for bank‑statement reconciliation.
3. **Compound Journal Entries**: Allow more complex entry patterns (e.g., multiple debits and credits across many accounts).
4. **Audit Log**: Track who created each journal entry and when.

## Related Documentation

- [Cashlint System Design and Glossary](../contexts/Cashlint%20System%20Design%20and%20Glossary.docx)
- [Ledger API Tests](../../api/routes/ledger.test.md)
- [Functional Programming Error Handling Principles](../contexts/Functional%20Programming%20Error%20Handling%20Principles.md)
