# Sales Context API Integration Tests

## Overview
This file (`src/api/routes/sales.test.ts`) contains integration tests for the Sales bounded context’s API routes. The Sales context handles revenue recognition, customer management, sales invoices, and related transactions. These tests verify that customers can be created and listed, sales invoices can be issued, and that the system enforces business rules such as duplicate invoice numbers and user isolation.

## Purpose
- Ensure the `POST /api/sales/customers` endpoint creates customers with proper validation.
- Verify the `GET /api/sales/customers` and `GET /api/sales/customers/:customerId` endpoints correctly list and retrieve customers, respecting user isolation.
- Test the `POST /api/sales/invoices` endpoint issues sales invoices, creates corresponding journal entries, and validates required accounts (Accounts Receivable, Service Revenue).
- Validate that `GET /api/sales/invoices` and `GET /api/sales/invoices/:invoiceId` work with pagination and user scoping.
- Confirm that unimplemented endpoints (`POST /api/sales/cash‑sales`, `POST /api/sales/customer‑deposits`, `POST /api/sales/invoices/:invoiceId/payments`) return appropriate status codes (501 or 400).
- Check the `GET /api/sales/health` endpoint returns a correct health status.
- Guarantee data isolation between test runs by cleaning the database before each test.

## Test Structure

### Top‑Level Setup
- `beforeAll`: Connects to the Prisma database.
- `beforeEach`: Cleans up the database in a specific order that respects foreign‑key constraints (starting with the newly added `Period` table to avoid constraint violations).
- `afterAll`: Disconnects from the database.

### Helper Functions
- `createTestUser(username)`: Creates a user in the database and returns the user ID.
- `createTestAccount(userId, code, name, type, normalBalance)`: Creates an account for the given user and returns the account ID.
- `createTestCustomer(userId, name, email)`: Creates a customer for the given user and returns the customer ID.

### Test Suites

#### 1. `POST /api/sales/customers`
Tests customer creation:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid customer with name and email | Returns 201, customer created |
| Customer without email | Returns 201, email undefined |
| Missing userId | Returns 400 (ApplicationFailure, subtype MissingField) |
| Missing name | Returns 400 (ApplicationFailure, subtype MissingField) |
| Non‑string name | Returns 400 (ApplicationFailure, subtype MissingField) |
| Invalid email format | Returns 400 (DomainFailure, subtype InvalidCustomerEmail) |

#### 2. `GET /api/sales/customers`
Tests listing customers:

| Test Case | Expected Behavior |
|-----------|-------------------|
| User with two customers | Returns 200, list of two customers |
| User with no customers | Returns 200, empty list |
| Missing userId query parameter | Returns 400 (ApplicationFailure, subtype MissingField) |
| Numeric string userId | Accepts and returns empty list (coercion allowed) |

#### 3. `GET /api/sales/customers/:customerId`
Tests retrieving a specific customer:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Existing customer belonging to the user | Returns 200, customer details |
| Non‑existent customer ID | Returns 404 (DomainFailure, subtype CustomerNotFound) |
| Customer belongs to another user | Returns 404 (DomainFailure, subtype CustomerNotFound) |
| Missing userId query parameter | Returns 400 (ApplicationFailure, subtype MissingField) |

#### 4. `POST /api/sales/invoices`
Tests issuing a sales invoice:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid invoice data | Returns 201, invoice created, journal entry linked |
| Missing required fields (e.g., total) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Invalid total (negative) | Returns 400 (ApplicationFailure, subtype MissingField) |
| Duplicate invoice number for same user | Returns 409 (DomainFailure, subtype DuplicateInvoiceNumber) |
| Same invoice number for different users | Both succeed |
| Non‑existent customer | Returns 404 (DomainFailure, subtype CustomerNotFound) |
| Missing required accounts (111, 401) | Returns 404 (DomainFailure, subtype AccountNotFound) |

#### 5. `GET /api/sales/invoices`
Tests listing invoices with pagination:

| Test Case | Expected Behavior |
|-----------|-------------------|
| User with two invoices | Returns 200, list of two invoices (ordered by date descending) |
| Pagination (skip=0, take=2) | Returns first page of two invoices |
| Pagination (skip=2, take=2) | Returns second page of invoices |
| Missing userId | Returns 400 (ApplicationFailure, subtype MissingField) |

#### 6. `GET /api/sales/invoices/:invoiceId`
Tests retrieving a specific invoice:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Existing invoice belonging to the user | Returns 200, invoice details |
| Non‑existent invoice ID | Returns 404 (DomainFailure, subtype InvoiceNotFound) |
| Invoice belongs to another user | Returns 404 (DomainFailure, subtype InvoiceNotFound) |

#### 7. `POST /api/sales/invoices/:invoiceId/payments`
- Currently only tests missing required fields (date, method) and returns 400 (ApplicationFailure, subtype MissingField).

#### 8. `POST /api/sales/cash‑sales` and `POST /api/sales/customer‑deposits`
- Both return 501 Not Implemented with an ApplicationFailure (subtype NotImplemented).

#### 9. `GET /api/sales/health`
- Returns 200 with `status: 'ok'`, `context: 'sales'`, and a timestamp.

## Dependencies & Integration
- **Database**: Uses a real MySQL instance via Prisma. All tests are true integration tests that hit the database.
- **Cleanup Order**: The `beforeEach` hook deletes records in reverse dependency order. The addition of `await prisma.period.deleteMany()` at the beginning ensures that foreign‑key constraints involving the `Period` model (added in the PeriodClose context) are satisfied.
- **Error Mapping**: Relies on the shared error‑mapper (`src/common/infrastructure/errorMapper.ts`) to convert `Result<T, AppError>` failures into HTTP responses.
- **Account Types**: Uses the `AccountType` and `NormalBalance` types from `@/bounded‑contexts/ledger/domain/ledger`.
- **Journal Entries**: Invoicing automatically creates a journal entry debiting Accounts Receivable (111) and crediting Service Revenue (401). The tests verify that this linkage exists.

## Key Testing Patterns
1. **Isolation**: Each test runs with a clean database, preventing cross‑test pollution.
2. **Helper Usage**: Test‑specific users, accounts, and customers are created via helpers to keep tests DRY.
3. **User Scoping**: Data is strictly isolated per user; attempts to access another user’s resources result in 404.
4. **Pagination**: The listing endpoint supports `skip` and `take` parameters; tests verify correct page slicing.
5. **Database Verification**: After API calls, the test often queries the database directly to confirm the expected state (e.g., journal‑entry linkage).

## Important Notes
- The test file was updated to include `await prisma.period.deleteMany()` in the cleanup sequence after the PeriodClose context introduced the `Period` model. Without this, foreign‑key constraints would cause test failures when running the full suite.
- Invoice creation requires the existence of specific accounts (111 for Accounts Receivable, 401 for Service Revenue). If they are missing, the workflow returns `AccountNotFound`.
- Several endpoints are marked as “Not Implemented” in v1; their tests currently expect a 501 status.

## Running the Tests
```bash
npm test src/api/routes/sales.test.ts
```

## Related Files
- `src/api/routes/sales.ts` – The route handlers being tested.
- `src/bounded‑contexts/sales/` – Domain, application, and infrastructure layers for the Sales context.
- `src/common/infrastructure/errorMapper.ts` – Maps domain errors to HTTP responses.
- `src/common/types/result.ts` – The `Result` monad used for error handling.

## Test Coverage
The tests cover:
- Happy path creation and retrieval of customers and invoices (201, 200)
- Input validation (400)
- Business‑rule violations (409 for duplicates, 404 for missing resources)
- Unimplemented features (501)
- Health endpoint (200)

Edge cases such as cross‑user isolation, pagination, and missing dependencies are thoroughly validated.