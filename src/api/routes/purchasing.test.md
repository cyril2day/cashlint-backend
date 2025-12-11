# Purchasing Context API Integration Tests

## Overview
This file (`src/api/routes/purchasing.test.ts`) contains integration tests for the Purchasing bounded context’s API routes. The Purchasing context handles expense recognition, vendor management, vendor bills, loan payments, and cash expenses. These tests verify that vendors can be created and listed, vendor bills can be recorded, loan payments are processed correctly, and cash expenses are recorded with proper journal entries.

## Purpose
- Ensure the `POST /api/purchasing/vendors` endpoint creates vendors with proper validation.
- Verify the `GET /api/purchasing/vendors` endpoint correctly lists vendors for a user.
- Test the `POST /api/purchasing/vendor‑bills` endpoint records a vendor bill, creates corresponding journal entries, and validates required accounts (Accounts Payable, Expense).
- Validate that `POST /api/purchasing/loan‑payments` records a loan payment, splitting principal and interest, and links to the appropriate loan and accounts.
- Confirm that `POST /api/purchasing/cash‑expenses` records a cash expense and creates a journal entry.
- Check the `GET /api/purchasing/health` endpoint returns a correct health status.
- Guarantee data isolation between test runs by cleaning the database before each test.

## Test Structure

### Top‑Level Setup
- `beforeAll`: Connects to the Prisma database.
- `beforeEach`: Cleans up the database in a specific order that respects foreign‑key constraints (starting with the newly added `Period` table to avoid constraint violations).
- `afterAll`: Disconnects from the database.

### Helper Functions
- `createTestUser(username)`: Creates a user in the database and returns the user ID.
- `createTestAccount(userId, code, name, type, normalBalance)`: Creates an account for the given user and returns the account ID.
- `createTestVendor(userId, name, email)`: Creates a vendor for the given user and returns the vendor ID.

### Test Suites

#### 1. `POST /api/purchasing/vendors`
Tests vendor creation:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid vendor with name and email | Returns 201, vendor created with balance 0 |
| Vendor without email | Returns 201, email undefined |
| Missing userId | Returns 400 (ApplicationFailure, subtype MissingField) |
| Missing name | Returns 400 (ApplicationFailure, subtype MissingField) |
| Invalid email format | Returns 400 (DomainFailure, subtype InvalidVendorEmail) |

#### 2. `GET /api/purchasing/vendors`
Tests listing vendors:

| Test Case | Expected Behavior |
|-----------|-------------------|
| User with two vendors | Returns 200, list of two vendors |
| User with no vendors | Returns 200, empty list |
| Missing userId query parameter | Returns 400 (ApplicationFailure, subtype MissingField) |

#### 3. `POST /api/purchasing/vendor‑bills`
Tests recording a vendor bill:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid bill data | Returns 201, bill created, journal entry linked |
| Missing required fields (e.g., amount) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Duplicate bill number for same user | Returns 409 (DomainFailure, subtype DuplicateBillNumber) |
| Non‑existent vendor | Returns 404 (DomainFailure, subtype VendorNotFound) |

#### 4. `POST /api/purchasing/loan‑payments`
Tests recording a loan payment:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid loan payment data | Returns 201, loan payment created, journal entry linked |
| Missing required fields (e.g., principalAmount) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Non‑existent vendor | Returns 404 (DomainFailure, subtype VendorNotFound) |

#### 5. `POST /api/purchasing/cash‑expenses`
Tests recording a cash expense:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid cash expense data | Returns 201, cash expense created, journal entry linked |
| Missing required fields (e.g., amount) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Non‑existent vendor | Returns 404 (DomainFailure, subtype VendorNotFound) |

#### 6. `GET /api/purchasing/health`
- Returns 200 with `status: 'ok'`, `context: 'purchasing'`, and a timestamp.

## Dependencies & Integration
- **Database**: Uses a real MySQL instance via Prisma. All tests are true integration tests that hit the database.
- **Cleanup Order**: The `beforeEach` hook deletes records in reverse dependency order. The addition of `await prisma.period.deleteMany()` at the beginning ensures that foreign‑key constraints involving the `Period` model (added in the PeriodClose context) are satisfied.
- **Error Mapping**: Relies on the shared error‑mapper (`src/common/infrastructure/errorMapper.ts`) to convert `Result<T, AppError>` failures into HTTP responses.
- **Account Types**: Uses the `AccountType` and `NormalBalance` types from `@/bounded‑contexts/ledger/domain/ledger`.
- **Journal Entries**:
  - Vendor bill: Debits an Expense account, credits Accounts Payable (201).
  - Loan payment: Debits Notes Payable (251) for principal, Interest Expense (505) for interest, credits Cash (101).
  - Cash expense: Debits an Expense account, credits Cash (101).

## Key Testing Patterns
1. **Isolation**: Each test runs with a clean database, preventing cross‑test pollution.
2. **Helper Usage**: Test‑specific users, accounts, and vendors are created via helpers to keep tests DRY.
3. **User Scoping**: Data is strictly isolated per user; the tests do not explicitly test cross‑user access because the repository layer enforces user‑based queries.
4. **Database Verification**: After API calls, the test often queries the database directly to confirm the expected state (e.g., journal‑entry linkage).
5. **Loan Payment Complexity**: The loan‑payment test creates a loan record beforehand because the workflow expects an existing loan for the vendor.

## Important Notes
- The test file was updated to include `await prisma.period.deleteMany()` in the cleanup sequence after the PeriodClose context introduced the `Period` model. Without this, foreign‑key constraints would cause test failures when running the full suite.
- Vendor bills and cash expenses require specific accounts to exist (e.g., 201 for Accounts Payable, 501 for Salaries Expense). The test helpers create these accounts as needed.
- Loan payments require a pre‑existing loan for the vendor; the test creates one with sufficient principal.

## Running the Tests
```bash
npm test src/api/routes/purchasing.test.ts
```

## Related Files
- `src/api/routes/purchasing.ts` – The route handlers being tested.
- `src/bounded‑contexts/purchasing/` – Domain, application, and infrastructure layers for the Purchasing context.
- `src/common/infrastructure/errorMapper.ts` – Maps domain errors to HTTP responses.
- `src/common/types/result.ts` – The `Result` monad used for error handling.

## Test Coverage
The tests cover:
- Happy path creation of vendors, bills, loan payments, and cash expenses (201)
- Input validation (400)
- Business‑rule violations (409 for duplicates, 404 for missing resources)
- Health endpoint (200)

Edge cases such as missing fields, invalid emails, and missing dependencies are thoroughly validated.