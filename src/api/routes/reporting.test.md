# Reporting Context API Integration Tests

## Overview
This file (`src/api/routes/reporting.test.ts`) contains integration tests for the Reporting bounded context’s API routes. The Reporting context is a read‑only projection that generates the four standard financial statements from ledger data. These tests verify that each statement endpoint returns correct data, respects date ranges, handles missing data gracefully, and enforces user isolation.

## Purpose
- Ensure the `GET /api/reporting/income-statement` endpoint returns a properly formatted income statement for the given period.
- Verify the `GET /api/reporting/balance-sheet` endpoint returns a balance sheet that satisfies the accounting equation (Assets = Liabilities + Equity).
- Test the `GET /api/reporting/owners-equity` endpoint returns a statement of owner’s equity that correctly reflects capital changes.
- Validate the `GET /api/reporting/cash-flow` endpoint classifies cash flows into operating, investing, and financing activities.
- Confirm that missing or invalid query parameters are handled with appropriate error responses (400).
- Check the `GET /api/reporting/health` endpoint returns a correct health status.
- Guarantee data isolation between users: one user’s financial data must never leak into another user’s reports.

## Test Structure

### Top‑Level Setup
- `beforeAll`: Connects to the Prisma database.
- `beforeEach`: Cleans up the database in a specific order that respects foreign‑key constraints (starting with the `Period` table, then dependent tables).
- `afterAll`: Disconnects from the database.

### Helper Functions
- `createTestUser(username)`: Creates a user and returns the user ID.
- `createTestAccount(userId, code, name, type, normalBalance)`: Creates an account and returns the account ID.
- `postJournalEntry(userId, description, date, lines)`: Helper to post a journal entry via the ledger API (or directly using the ledger workflow).
- `createTestCustomer`, `issueSalesInvoice`, etc. – used to generate sample transaction data that will appear in reports.

### Test Suites

#### 1. `GET /api/reporting/income-statement`
Tests the income statement generation.

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid period with revenue and expense transactions | Returns 200, `IncomeStatement` with correct totals and net income |
| Period with no transactions | Returns 200, empty sections, zero totals |
| Missing `startDate` or `endDate` | Returns 400 (ApplicationFailure, subtype MissingField) |
| Invalid date format | Returns 400 (ApplicationFailure, subtype InvalidParameterFormat) |
| Start date after end date | Returns 400 (DomainFailure, subtype InvalidDateRange) |
| User‑scoped isolation | User A’s transactions do not appear in User B’s income statement |

#### 2. `GET /api/reporting/balance-sheet`
Tests the balance sheet generation.

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid as‑of date with assets, liabilities, equity | Returns 200, `BalanceSheet` with accounting equation satisfied (within tolerance) |
| No accounts exist | Returns 200, empty sections, zero totals (equation still holds) |
| Missing `asOfDate` | Returns 400 (ApplicationFailure, subtype MissingField) |
| Data inconsistency causing equation violation | Returns 400 (DomainFailure, subtype AccountingEquationViolation) |
| Contra‑asset accounts | Negative amounts correctly subtracted from asset total |

#### 3. `GET /api/reporting/owners-equity`
Tests the statement of owner’s equity generation.

| Test Case | Expected Behavior |
|-----------|-------------------|
| Period with capital contributions, net income, drawings | Returns 200, `StatementOfOwnersEquity` with correct calculations |
| Missing `startDate` or `endDate` | Returns 400 (ApplicationFailure, subtype MissingField) |
| No capital or drawing accounts | Returns 200, zero beginning capital, zero contributions/drawings |

#### 4. `GET /api/reporting/cash-flow`
Tests the statement of cash flows generation.

| Test Case | Expected Behavior |
|-----------|-------------------|
| Period with cash transactions classified into activities | Returns 200, `StatementOfCashFlows` with correct classification and net change |
| No cash transactions | Returns 200, empty activities, zero net change |
| Missing `startDate` or `endDate` | Returns 400 (ApplicationFailure, subtype MissingField) |
| Cash account not found | Returns 404 (DomainFailure, subtype AccountNotFound) |

#### 5. `GET /api/reporting/health`
- Returns 200 with `status: 'ok'`, `context: 'reporting'`, and a timestamp.

## Dependencies & Integration
- **Database**: Uses a real MySQL instance via Prisma. All tests are true integration tests that hit the database.
- **Cleanup Order**: The `beforeEach` hook deletes records in reverse dependency order, starting with `Period` (if any), then `Payment`, `LoanPayment`, `CashExpense`, `VendorBill`, `SalesInvoice`, `CashSale`, `CustomerDeposit`, `JournalLine`, `JournalEntry`, `Loan`, `Vendor`, `Customer`, `Account`, `Session`, and finally `User`.
- **Error Mapping**: Relies on the shared error‑mapper (`src/common/infrastructure/errorMapper.ts`) to convert `Result<T, AppError>` failures into HTTP responses.
- **Ledger Context**: Reporting depends on the Ledger context for account and journal‑entry data. The tests must create accounts and journal entries before generating reports.

## Key Testing Patterns
1. **Isolation**: Each test runs with a clean database, preventing cross‑test pollution.
2. **Data Setup**: Use helper functions to create realistic accounting scenarios (e.g., issue an invoice, record a payment, post a manual journal entry) so that reports contain meaningful data.
3. **User Scoping**: Data is strictly isolated per user; attempts to access another user’s resources result in empty reports (or errors if a required account is missing).
4. **Accounting Equation**: Balance sheet tests must verify that Assets = Liabilities + Equity within a small tolerance (e.g., 0.01) because of floating‑point rounding.
5. **Classification Verification**: Cash‑flow tests must verify that transactions are correctly classified (operating, investing, financing) based on heuristics (e.g., revenue/expense → operating, asset purchase → investing, capital contribution → financing).

## Important Notes
- The Reporting context is read‑only; no data is written by these endpoints.
- The endpoints are synchronous and may perform intensive calculations for large data sets. Performance is not a primary concern in v1, but tests should complete within a reasonable time.
- The cash‑flow classification heuristics are simplistic in v1 (e.g., mapping by account type). Future versions may introduce more sophisticated rules.

## Running the Tests
```bash
npm test src/api/routes/reporting.test.ts
```

## Related Files
- `src/api/routes/reporting.ts` – The route handlers being tested.
- `src/bounded‑contexts/reporting/` – Domain, application, and infrastructure layers for the Reporting context.
- `src/common/infrastructure/errorMapper.ts` – Maps domain errors to HTTP responses.
- `src/common/types/result.ts` – The `Result` monad used for error handling.

## Test Coverage
The tests cover:
- Happy path generation of all four statements (200)
- Input validation (400)
- Business‑rule violations (400 for invalid date ranges, accounting equation violations)
- Missing resources (404 for missing cash account)
- Health endpoint (200)

Edge cases such as empty data sets, contra accounts, and cross‑user isolation are thoroughly validated.

---
*Last updated: 2025-12-11*