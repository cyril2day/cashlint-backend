# Reporting Bounded Context

## Overview

The **Reporting** bounded context is a **read‑only projection** that generates the four standard financial statements from ledger data (accounts and journal entries). It contains no behavior (commands, events) and is purely a set of pure calculations that transform account balances and transaction data into structured reports.

This context ensures that the user can always access accurate, up‑to‑date financial statements that reflect the accrual‑basis accounting principles of Cashlint.

## Purpose & Business Value

For a sole proprietor, understanding the financial health of the business is critical. The Reporting context provides:

1. **Income Statement**: Shows revenue earned and expenses incurred in a given period, yielding the true profit (net income).
2. **Balance Sheet**: Snapshot of what the business owns (assets), owes (liabilities), and the owner’s equity at a specific date.
3. **Statement of Owner’s Equity**: Explains how the owner’s capital changed during a period (contributions, profit, drawings).
4. **Statement of Cash Flows**: Explains why cash changed, broken into operating, investing, and financing activities.

These statements are generated on‑demand and are always consistent with the underlying double‑entry bookkeeping.

## Key Concepts

### AccountWithBalance
An account together with its current balance (as of a given date or period). The balance is signed according to the account’s normal balance (debit‑positive for assets/expenses, credit‑positive for liabilities/equity/revenue).

### Financial Statement
Each of the four statements is a value object that groups line items and calculates totals. They are immutable and derived entirely from ledger data.

### Pure Calculation
All reporting logic is implemented as pure functions that take data (accounts, journal lines) and return a `Result<Statement, AppError>`. No side effects, no database writes.

## Bounded Context Boundaries

The Reporting context is a **supporting subdomain** that depends on:

- **Ledger Context**: For account and journal‑entry data.
- **Identity Context**: For user‑scoped data isolation.

It does not:

- Modify any data.
- Send events or commands.
- Have any state of its own.

## Domain Model

### Types
- `AccountWithBalance` (readonly)
- `StatementLine` (account code, name, amount)
- `IncomeStatement`, `BalanceSheet`, `StatementOfOwnersEquity`, `StatementOfCashFlows`

### Pure Functions
- `classifyAccountByType`
- `isContraAccount`
- `calculateAccountBalance`
- `calculateNetIncome`
- `buildIncomeStatement`, `buildBalanceSheet`, `buildStatementOfOwnersEquity`, `buildStatementOfCashFlows`
- Validation helpers (`validateDateRange`, `validateAccountBalancesConsistent`)

### Error Subtypes
- `ReportingDomainSubtype`: `'NoDataForPeriod'`, `'InvalidAccountType'`, `'CalculationError'`, `'AccountingEquationViolation'`, `'InvalidDateRange'`
- `ReportingInfrastructureSubtype`: `'DataFetchFailed'`, `'CacheMiss'`
- `ReportingApplicationSubtype`: `'MissingDateParameter'`, `'InvalidParameterFormat'`

## Workflows

### 1. Generate Income Statement
**Command**: `GenerateIncomeStatementCommand` (userId, startDate, endDate)  
**Steps**:
1. Validate date range.
2. Fetch accounts with balances for the period.
3. Call `buildIncomeStatement`.
4. Return `Result<IncomeStatement>`.

### 2. Generate Balance Sheet
**Command**: `GenerateBalanceSheetCommand` (userId, asOfDate)  
**Steps**:
1. Validate asOfDate.
2. Fetch accounts with balances up to that date.
3. Call `buildBalanceSheet`.
4. Return `Result<BalanceSheet>`.

### 3. Generate Statement of Owner’s Equity
**Command**: `GenerateStatementOfOwnersEquityCommand` (userId, startDate, endDate)  
**Steps**:
1. Fetch capital and drawing accounts.
2. Compute net income (reuse income‑statement logic).
3. Call `buildStatementOfOwnersEquity`.
4. Return `Result<StatementOfOwnersEquity>`.

### 4. Generate Statement of Cash Flows
**Command**: `GenerateStatementOfCashFlowsCommand` (userId, startDate, endDate)  
**Steps**:
1. Identify cash account (default code 101).
2. Fetch cash journal lines for the period.
3. Classify each line into operating, investing, or financing.
4. Call `buildStatementOfCashFlows`.
5. Return `Result<StatementOfCashFlows>`.

## Directory Structure

```
src/bounded-contexts/reporting/
├── domain/
│   ├── reporting.ts          # Types and pure functions
│   ├── errors.ts             # Error subtypes
│   └── reporting.test.ts     # Unit tests
├── application/
│   ├── generateIncomeStatementWorkflow.ts
│   ├── generateBalanceSheetWorkflow.ts
│   ├── generateStatementOfOwnersEquityWorkflow.ts
│   ├── generateStatementOfCashFlowsWorkflow.ts
│   └── *.test.ts             # Workflow tests
├── infrastructure/
│   ├── reportingRepo.ts      # Data access
│   └── reportingRepo.test.ts
└── Reporting-Context.md      (this file)
```

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/reporting/income-statement?startDate=&endDate=` | Income statement for a period |
| GET | `/api/reporting/balance-sheet?asOfDate=` | Balance sheet as of a date |
| GET | `/api/reporting/owners-equity?startDate=&endDate=` | Statement of owner’s equity |
| GET | `/api/reporting/cash-flow?startDate=&endDate=` | Statement of cash flows |
| GET | `/api/reporting/health` | Health check |

All endpoints require a valid session cookie (userId extracted from session). Query parameters are validated and mapped to the corresponding workflow.

## Dependencies

- **Ledger Context**: For account and journal‑entry types and default account codes.
- **Shared**: `Result<T, AppError>`, `AppError` factories, validation helpers.
- **Prisma**: Database access (via repository).

## Error Handling

All operations return a `Result<T, AppError>`.

- **DomainFailures** are mapped to HTTP 400 (e.g., invalid date range, accounting equation violation).
- **ApplicationFailures** (missing parameters) are also mapped to HTTP 400.
- **InfrastructureFailures** are mapped to HTTP 500.

## Testing Strategy

- **Unit Tests**: For pure domain functions (no side effects).
- **Integration Tests**: For repository (real database) and API routes (supertest).
- **Property‑Based Tests**: For accounting invariants (e.g., Assets = Liabilities + Equity).

## How It Fits into the Cashlint System

The Reporting context is a **supporting subdomain** that provides the final output of the accounting system—the financial statements. It relies on the accuracy of the Ledger context and respects the isolation guarantees of the Identity context. It is essential for the user to make informed business decisions.

## Future Enhancements

1. **Caching**: Cache computed statements for a period to improve performance.
2. **Comparative Reports**: Compare with prior periods.
3. **Export Formats**: PDF, Excel export.
4. **Custom Date Ranges**: Support for arbitrary date ranges (beyond periods).
5. **Drill‑Down**: Click a line item to see underlying transactions.

## Related Documentation

- [Cashlint System Design and Glossary](../../contexts/Cashlint%20System%20Design%20and%20Glossary.docx)
- [Reporting API Tests](../../api/routes/reporting.test.md)
- [Functional Programming Error Handling Principles](../../contexts/Functional%20Programming%20Error%20Handling%20Principles.md)

---
*Last updated: 2025-12-11*