# PeriodClose Bounded Context

## Overview

The **PeriodClose** bounded context is responsible for managing accounting periods and manual adjusting journal entries in the Cashlint accrual‑based accounting system. It ensures that financial periods (months, quarters, years) can be defined, tracked, and closed, and that manual journal entries are posted only within open periods—enforcing the accrual accounting principle that transactions must be recorded in the period to which they relate.

## Purpose & Business Value

In accrual accounting, revenue and expenses are recognized when earned or incurred, not when cash changes hands. To maintain accurate period‑based financial statements, the system must:

1. **Define Periods**: Allow users to create accounting periods with a start and end date.
2. **Control Entry Timing**: Restrict journal entries (especially manual adjusting entries) to open periods.
3. **Close Periods**: Prevent modifications to a period once it is closed, preserving the integrity of historical financial data.

The PeriodClose context provides these capabilities, acting as a gatekeeper for the ledger during the period‑end closing process.

## Key Concepts

### Period
An accounting period represents a span of time (e.g., “January 2025”) during which transactions are recorded. A period has:

- **Name**: A user‑friendly identifier (must be unique per user).
- **Start Date** and **End Date**: The inclusive date range.
- **Status**: Either `Open` (transactions can be posted) or `Closed` (no further modifications allowed).
- **Closed At**: Timestamp when the period was closed.

### Manual Journal Entry
A journal entry created outside the automated workflows (Sales, Purchasing, etc.). Used for rare adjustments such as depreciation, accruals, or year‑end corrections. The entry must:

- Be balanced (total debits = total credits).
- Have a date that falls within an open period.

## Bounded Context Boundaries

The PeriodClose context is distinct from:

- **Ledger Context**: PeriodClose uses the Ledger’s journal‑entry posting capability but adds period‑validation rules.
- **Sales & Purchasing Contexts**: Those contexts post journal entries automatically as part of their workflows; they do not require an open period check (they are considered “routine” transactions).
- **Reporting Context**: Reporting reads from the event stream and is independent of period status.

## Domain Model

### Aggregate Root: `Period`
The `Period` aggregate enforces the following invariants:

1. **Unique Name per User**: Two periods for the same user cannot have the same name.
2. **Valid Date Range**: Start date must be strictly before end date.
3. **Closed Period Immutability**: Once closed, a period cannot be reopened or have its dates changed.
4. **Open Period Existence**: At least one open period must exist for manual journal entries to be posted.

### Value Objects
- `PeriodName`: A string validated for uniqueness per user.
- `PeriodDateRange`: Ensures start < end.

### Domain Events
- `PeriodCreated`
- `PeriodClosed`
- `ManualJournalEntryPosted` (may be shared with Ledger)

## Workflows

### 1. Create Period
**Command**: `CreatePeriod`
**Steps**:
1. Validate input (name, dates).
2. Check for duplicate period name for the same user.
3. Create a new `Period` aggregate with status `Open`.
4. Persist the aggregate.
5. Return success with the created period.

**Errors**:
- `DuplicatePeriodName`
- `InvalidPeriodDateRange`
- `MissingField`

### 2. Close Period
**Command**: `ClosePeriod`
**Steps**:
1. Retrieve the period by ID and user.
2. Ensure the period is open.
3. Update status to `Closed`, set `closedAt` timestamp.
4. Persist the change.
5. Return success.

**Errors**:
- `PeriodNotFound`
- `PeriodAlreadyClosed`

### 3. Post Manual Journal Entry
**Command**: `PostManualJournalEntry`
**Steps**:
1. Validate the entry (description, date, lines).
2. Ensure the entry date falls within an open period for the user.
3. Delegate to the Ledger context to post the journal entry (enforcing double‑entry rules).
4. Link the journal entry to the period (via date inclusion).
5. Return the created journal entry.

**Errors**:
- `PeriodNotOpen`
- `JournalEntryNotBalanced`
- `AccountNotFound`
- `InsufficientLines`

## Directory Structure

```
src/bounded-contexts/period-close/
├── domain/
│   ├── period.ts              # Period aggregate, value objects, invariants
│   ├── errors.ts              # Context‑specific error subtypes
│   └── period.test.ts         # Unit tests for domain logic
├── application/
│   ├── createPeriodWorkflow.ts
│   ├── closePeriodWorkflow.ts
│   ├── postManualJournalEntryWorkflow.ts
│   └── *.test.ts              # Workflow unit tests
├── infrastructure/
│   ├── periodRepo.ts          # Repository for Period aggregate
│   └── periodRepo.test.ts     # Repository integration tests
└── PeriodClose-Context.md     (this file)
```

## Dependencies

### Internal Dependencies
- **Ledger Context**: PeriodClose uses the Ledger’s journal‑entry posting capability via the `postJournalEntryWorkflow`.
- **Shared Types**: `Result<T, AppError>`, `AppError` subtypes.

### External Dependencies
- **Prisma Client**: For database persistence.
- **Date‑time library**: Native `Date` objects.

## API Routes

The context exposes the following HTTP endpoints (see `src/api/routes/period‑close.ts`):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/period-close/periods` | Create a new period |
| GET | `/api/period-close/periods` | List periods for a user (with optional status filter) |
| POST | `/api/period-close/periods/:periodId/close` | Close a specific period |
| POST | `/api/period-close/manual-journal-entries` | Post a manual adjusting journal entry |
| GET | `/api/period-close/health` | Health check |

## Error Handling

All operations return a `Result<T, AppError>` where errors are categorized as:

- **DomainFailure**: Business‑rule violations (e.g., duplicate name, invalid date range).
- **InfrastructureFailure**: Database errors (e.g., duplicate key violation).
- **ApplicationFailure**: Request‑validation errors (e.g., missing fields).

Error mapping to HTTP status codes is done in the API layer (`errorMapper.ts`).

## Testing Strategy

### Unit Tests
- **Domain**: Test aggregate invariants, value‑object validation.
- **Workflows**: Mock dependencies to test business logic.

### Integration Tests
- **API Routes**: Use `supertest` to verify endpoint behavior.
- **Repository**: Test database operations with a real test database.

### Key Test Scenarios
1. Period creation with duplicate name (same user, different user).
2. Closing an already‑closed period.
3. Posting a manual journal entry outside any open period.
4. Balanced vs. unbalanced journal entries.

## How It Fits into the Cashlint System

PeriodClose is a **supporting subdomain** that enables the core accounting domain (Ledger) to maintain period integrity. It is invoked:

- **During month‑end closing**: The user closes a period to lock it.
- **When posting manual adjustments**: The system validates that the adjustment belongs to an open period.

Without this context, the ledger would lack temporal boundaries, making financial reporting unreliable.

## Future Enhancements

1. **Automatic Period Creation**: Allow system‑generated periods (e.g., monthly) based on a template.
2. **Period‑End Adjustments**: Automate common adjusting entries (depreciation, prepaid amortization).
3. **Soft Close / Reopen**: Allow an admin to reopen a closed period for corrections (with audit trail).
4. **Period‑Specific Reports**: Generate trial balance, income statement, etc., for a specific period.

## Related Documentation

- [Cashlint System Design and Glossary](../contexts/Cashlint%20System%20Design%20and%20Glossary.docx)
- [PeriodClose API Tests](../../api/routes/period-close.test.md)
- [Functional Programming Error Handling Principles](../contexts/Functional%20Programming%20Error%20Handling%20Principles.md)
