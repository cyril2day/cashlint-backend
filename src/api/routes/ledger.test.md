# Ledger Context API Integration Tests

## Overview
This file (`src/api/routes/ledger.test.ts`) contains integration tests for the Ledger bounded context’s API routes. The Ledger context is the core of the double‑entry accounting system, responsible for managing accounts and journal entries. These tests verify that accounts can be created, journal entries posted, and that all accounting invariants (e.g., debits equal credits) are enforced.

## Purpose
- Ensure the `POST /api/ledger/accounts` endpoint creates accounts with proper validation, duplicate‑code detection, and user isolation.
- Verify the `POST /api/ledger/journal‑entries` endpoint posts balanced journal entries, rejects unbalanced entries, and correctly links to accounts.
- Test the `GET /api/ledger/health` endpoint returns a correct health status.
- Validate that all error responses (domain, infrastructure, application) are mapped to the appropriate HTTP status codes and error structures.
- Guarantee data isolation between test runs by cleaning the database before each test.

## Test Structure

### Top‑Level Setup
- `beforeAll`: Connects to the Prisma database.
- `beforeEach`: Cleans up the database in a specific order that respects foreign‑key constraints (starting with the newly added `Period` table to avoid constraint violations).
- `afterAll`: Disconnects from the database.

### Helper Functions
- `createTestUser(username)`: Creates a user in the database and returns the user ID.
- `createTestAccount(userId, code, name, type, normalBalance)`: Creates an account for the given user and returns the account ID.

### Test Suites

#### 1. `POST /api/ledger/accounts`
Tests account creation with various inputs:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid account data | Returns 201, account created |
| Duplicate account code for same user | Returns 409 (DomainFailure, subtype DuplicateAccountCode) |
| Duplicate account code for different users | Both succeed (user‑scoped uniqueness) |
| Invalid account code (non‑numeric) | Returns 400 (DomainFailure, subtype InvalidAccountCode) |
| Missing required field (e.g., code) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Invalid account type | Returns 400 (ApplicationFailure, subtype MissingField) |

#### 2. `POST /api/ledger/journal‑entries`
Tests journal‑entry posting:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Balanced journal entry (single debit/credit) | Returns 201, entry created with lines |
| Unbalanced journal entry (debits ≠ credits) | Returns 400 (DomainFailure, subtype JournalEntryNotBalanced) |
| Journal entry with missing account (invalid UUID) | Returns 404 (DomainFailure, subtype AccountNotFound) |
| Insufficient lines (only one line) | Returns 400 (DomainFailure, subtype InsufficientLines) |
| Invalid date format | Returns 400 (DomainFailure, subtype InvalidJournalEntryDate) |
| Complex entry with multiple debits and credits | Returns 201, total debits equal total credits |

#### 3. `GET /api/ledger/health`
- Single test verifying that the endpoint returns a 200 status with a JSON object containing `status: 'ok'`, `context: 'ledger'`, and a defined timestamp.

## Dependencies & Integration
- **Database**: Uses a real MySQL instance via Prisma. All tests are true integration tests that hit the database.
- **Cleanup Order**: The `beforeEach` hook deletes records in reverse dependency order. The addition of `await prisma.period.deleteMany()` at the beginning ensures that foreign‑key constraints involving the `Period` model (added in the PeriodClose context) are satisfied.
- **Error Mapping**: Relies on the shared error‑mapper (`src/common/infrastructure/errorMapper.ts`) to convert `Result<T, AppError>` failures into HTTP responses.
- **Account Types**: Uses the `AccountType` and `NormalBalance` types from `@/bounded‑contexts/ledger/domain/ledger`.

## Key Testing Patterns
1. **Isolation**: Each test runs with a clean database, preventing cross‑test pollution.
2. **Helper Usage**: Test‑specific users and accounts are created via helpers to keep tests DRY.
3. **Balance Invariant**: The core accounting rule “debits must equal credits” is tested both for success and failure.
4. **User Scoping**: Duplicate account codes are allowed across different users, but not within the same user.
5. **Database Verification**: After API calls, the test often queries the database directly to confirm the expected state (e.g., journal‑entry lines exist).

## Important Notes
- The test file was updated to include `await prisma.period.deleteMany()` in the cleanup sequence after the PeriodClose context introduced the `Period` model. Without this, foreign‑key constraints would cause test failures when running the full suite.
- Journal‑entry lines must reference existing accounts; otherwise, a `AccountNotFound` error is returned.
- The `date` field must be a valid ISO‑8601 string; invalid dates are caught by domain validation.

## Running the Tests
```bash
npm test src/api/routes/ledger.test.ts
```

## Related Files
- `src/api/routes/ledger.ts` – The route handlers being tested.
- `src/bounded‑contexts/ledger/` – Domain, application, and infrastructure layers for the Ledger context.
- `src/common/infrastructure/errorMapper.ts` – Maps domain errors to HTTP responses.
- `src/common/types/result.ts` – The `Result` monad used for error handling.

## Test Coverage
The tests cover:
- Happy path account and journal‑entry creation (201)
- Input validation (400)
- Business‑rule violations (400/409)
- Resource‑not‑found scenarios (404)
- Health endpoint (200)

Edge cases such as duplicate codes, unbalanced entries, and invalid references are thoroughly validated.