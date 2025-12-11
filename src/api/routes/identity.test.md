# Identity Context API Integration Tests

## Overview
This file (`src/api/routes/identity.test.ts`) contains integration tests for the Identity bounded context’s API routes. The tests verify that the user‑creation and health‑check endpoints work correctly, enforce business rules, and handle errors according to the functional‑programming error‑handling pattern.

## Purpose
- Ensure the `POST /api/users` endpoint creates a user with proper validation, normalization, and duplication checks.
- Verify the `GET /api/users/health` endpoint returns a correct health status.
- Validate that all error responses (domain, infrastructure, application) are mapped to the appropriate HTTP status codes and error structures.
- Guarantee data isolation between test runs by cleaning the database before each test.

## Test Structure

### Top‑Level Setup
- `beforeAll`: Connects to the Prisma database.
- `beforeEach`: Cleans up the database in a specific order that respects foreign‑key constraints (starting with the newly added `Period` table to avoid constraint violations).
- `afterAll`: Disconnects from the database.

### Helper Functions
None are defined in this file; test data is created directly via Prisma or API calls.

### Test Suites

#### 1. `POST /api/users`
Tests user creation with various inputs:

| Test Case | Expected Behavior |
|-----------|-------------------|
| Valid username | Returns 201, user created, username stored as lowercase |
| Uppercase username | Normalized to lowercase in response |
| Missing username | Returns 400 (ApplicationFailure) |
| Non‑string username | Returns 400 (ApplicationFailure) |
| Username shorter than 3 characters | Returns 400 (DomainFailure) |
| Username with spaces | Returns 400 (DomainFailure) |
| Username with non‑alphanumeric symbols | Returns 400 (DomainFailure) |
| Duplicate username | Returns 409 (InfrastructureFailure, subtype DuplicateKey) |

Each test asserts the exact error type and that the error message matches the expected pattern.

#### 2. `GET /api/users/health`
- Single test verifying that the endpoint returns a 200 status with a JSON object containing `status: 'ok'`, `context: 'identity'`, and a defined timestamp.

## Dependencies & Integration
- **Database**: Uses a real MySQL instance via Prisma. All tests are true integration tests that hit the database.
- **Cleanup Order**: The `beforeEach` hook deletes records in reverse dependency order. The addition of `await prisma.period.deleteMany()` at the beginning ensures that foreign‑key constraints involving the `Period` model (added in the PeriodClose context) are satisfied.
- **Error Mapping**: Relies on the shared error‑mapper (`src/common/infrastructure/errorMapper.ts`) to convert `Result<T, AppError>` failures into HTTP responses.

## Key Testing Patterns
1. **Isolation**: Each test runs with a clean database, preventing cross‑test pollution.
2. **Assertions**: Use `expect.assertions()` to ensure all async assertions are called.
3. **Error Validation**: Verify both the error `type` and `subtype` to guarantee the correct error hierarchy is used.
4. **Database Verification**: After API calls, the test often queries the database directly to confirm the expected state.

## Important Notes
- The test file was updated to include `await prisma.period.deleteMany()` in the cleanup sequence after the PeriodClose context introduced the `Period` model. Without this, foreign‑key constraints would cause test failures when running the full suite.
- Usernames are validated for length, allowed characters, and uniqueness (case‑insensitive).
- All endpoints are stateless; no session or authentication is required in v1.

## Running the Tests
```bash
npm test src/api/routes/identity.test.ts
```

## Related Files
- `src/api/routes/identity.ts` – The route handlers being tested.
- `src/bounded‑contexts/identity/` – Domain, application, and infrastructure layers for the Identity context.
- `src/common/infrastructure/errorMapper.ts` – Maps domain errors to HTTP responses.
- `src/common/types/result.ts` – The `Result` monad used for error handling.

## Test Coverage
The tests cover:
- Happy path creation (201)
- Input validation (400)
- Business‑rule violations (400/409)
- Infrastructure errors (409 for duplicate keys)
- Health endpoint (200)

Edge cases such as missing fields, invalid types, and cross‑user isolation are also validated.