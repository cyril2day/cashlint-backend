# PeriodClose API Routes Integration Tests

This file contains integration tests for the PeriodClose bounded context's API routes. It verifies that the endpoints behave correctly, including validation, error handling, and database interactions.

## File Location

- **Path**: `src/api/routes/period-close.test.ts`
- **Type**: Integration test (Vitest + Supertest)
- **Dependencies**: Express app, Prisma client, test database

## Test Structure

The test suite is organized using `describe` blocks that correspond to the API endpoints:

1. **POST /api/period-close/periods** – Creating a new accounting period
2. **GET /api/period-close/periods** – Listing periods for a user
3. **POST /api/period-close/periods/:periodId/close** – Closing an open period
4. **POST /api/period-close/manual-journal-entries** – Posting manual adjusting journal entries
5. **GET /api/period-close/health** – Health check endpoint

## Test Setup and Teardown

### Database Cleanup
Before each test, the database is cleaned up in a specific order to respect foreign‑key constraints:

```typescript
beforeEach(async () => {
  await prisma.period.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.loanPayment.deleteMany()
  await prisma.cashExpense.deleteMany()
  await prisma.vendorBill.deleteMany()
  await prisma.salesInvoice.deleteMany()
  await prisma.cashSale.deleteMany()
  await prisma.customerDeposit.deleteMany()
  await prisma.loan.deleteMany()
  await prisma.vendor.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.journalLine.deleteMany()
  await prisma.journalEntry.deleteMany()
  await prisma.account.deleteMany()
  await prisma.session.deleteMany()
  await prisma.user.deleteMany()
})
```

### Helper Functions
Three helper functions are defined to create test data:

- `createTestUser(username)` – creates a user and returns its ID
- `createTestAccount(userId, code, name, type, normalBalance)` – creates an account and returns its ID
- `createTestPeriod(userId, name, startDate, endDate, status)` – creates a period and returns its ID

## Test Cases

### 1. POST /api/period-close/periods

| Test Case | Description | Expected Status | Validation |
|-----------|-------------|----------------|------------|
| Create with valid data | All required fields provided | 201 | Period is created with correct fields |
| Duplicate name for same user | Same period name for the same user | 409 | InfrastructureFailure (DuplicateKey) |
| Duplicate name for different users | Same name allowed across users | 201 | Both periods exist |
| Invalid date range (start ≥ end) | Start date not before end date | 400 | DomainFailure (InvalidPeriodDateRange) |
| Missing required field | Omitted `name` field | 400 | ApplicationFailure (MissingField) |
| Invalid date format | Non‑ISO date string | 400 | DomainFailure (InvalidPeriodDateRange) |

### 2. GET /api/period-close/periods

| Test Case | Description | Expected Status | Validation |
|-----------|-------------|----------------|------------|
| List periods for a user | Three periods created | 200 | Returns three periods in response |
| Filter by status (Open/Closed) | One open, one closed | 200 | Each filter returns correct count |
| Missing userId query parameter | No userId provided | 400 | ApplicationFailure (MissingField) |

### 3. POST /api/period-close/periods/:periodId/close

| Test Case | Description | Expected Status | Validation |
|-----------|-------------|----------------|------------|
| Close an open period | Period exists and is open | 200 | Status changes to Closed, closedAt set |
| Period already closed | Attempt to close a closed period | 400 | DomainFailure (PeriodAlreadyClosed) |
| Period does not exist | Fake period ID | 404 | DomainFailure (PeriodNotFound) |
| Missing userId query parameter | No userId in request | 400 | ApplicationFailure (MissingField) |
| Period belongs to another user | User mismatch | 404 | DomainFailure (PeriodNotFound) |

### 4. POST /api/period-close/manual-journal-entries

| Test Case | Description | Expected Status | Validation |
|-----------|-------------|----------------|------------|
| Post within an open period | Entry date inside open period | 201 | Journal entry created, lines balanced |
| Date not within any open period | Entry outside open period range | 400 | DomainFailure (PeriodNotOpen) |
| All periods closed | No open period exists | 400 | DomainFailure (PeriodNotOpen) |
| Unbalanced journal entry | Debits ≠ credits | 400 | DomainFailure (JournalEntryNotBalanced) |
| Missing required fields | Empty request body | 400 | ApplicationFailure (MissingField) |

### 5. GET /api/period-close/health

| Test Case | Description | Expected Status | Validation |
|-----------|-------------|----------------|------------|
| Health check | Simple endpoint call | 200 | Returns status “ok” and context “period‑close” |

## Error Handling

All tests follow the project’s functional error‑handling pattern:

- **DomainFailure**: Business‑rule violations (e.g., invalid date range, duplicate name)
- **InfrastructureFailure**: Database‑level errors (e.g., duplicate key)
- **ApplicationFailure**: Request‑validation errors (e.g., missing fields)

Errors are returned as structured JSON with `type`, `subtype`, and `message`.

## Dependencies

- **Vitest**: Test runner
- **Supertest**: HTTP assertions
- **Prisma Client**: Database operations
- **Express app**: From `@/api/server`

## How to Run

```bash
pnpm test src/api/routes/period-close.test.ts
```

## Notes

- Tests are isolated by cleaning the database before each test.
- The order of deletions is critical to avoid foreign‑key constraint violations.
- The PeriodClose context relies on the Ledger context for journal‑entry validation and account existence.
- Manual journal entries require an open period; the system enforces the accrual‑basis accounting rule that entries must fall within an open period.
