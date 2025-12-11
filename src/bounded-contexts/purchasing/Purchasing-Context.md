# Purchasing Bounded Context

## Overview

The **Purchasing** bounded context handles expense recognition and vendor‑related transactions in the Cashlint accrual‑based accounting system. It ensures that expenses are recorded when incurred (accrual basis) by recording vendor bills, loan payments, and cash expenses. This context maintains subsidiary ledgers for accounts payable and tracks loans, enforcing business rules such as bill uniqueness and loan principal reduction.

## Purpose & Business Value

For a sole proprietor, tracking expenses accurately is critical for understanding cost structure and tax obligations. The Purchasing context provides:

1. **Vendor Management**: Create and manage vendor records with contact information and subsidiary balances.
2. **Vendor Bill Recording**: Record bills for credit purchases that trigger expense recognition and increase accounts payable.
3. **Loan Payment Recording**: Record payments on loans, splitting principal and interest portions.
4. **Cash Expense Recording**: Record expenses paid immediately (cash expenses) without a bill.

This context ensures that expenses are recognized in the correct period, supporting accurate income statements and balance sheets.

## Key Concepts

### Vendor
A vendor is an entity from whom the business purchases goods or services. A vendor has:

- **Name**: A unique identifier per user (not enforced globally).
- **Email**: Optional contact information.
- **Balance**: The total outstanding amount (accounts payable) for that vendor.

### Vendor Bill
A vendor bill represents a credit purchase. It includes:

- **Bill Number**: A user‑defined unique identifier (per user).
- **Amount**: The amount of expense incurred.
- **Date**: The date the expense is recognized (bill date).
- **Due Date**: Optional date by which payment is due.
- **Status**: `Draft`, `Recorded`, `PartiallyPaid`, or `Paid`.

### Loan
A loan from a vendor (notes payable). It includes:

- **Principal**: The original amount borrowed.
- **Interest Rate**: Annual interest rate (optional).
- **Term**: Loan term in months (optional).

### Loan Payment
A payment made on a loan, split into:

- **Principal Amount**: Reduces the loan principal.
- **Interest Amount**: Treated as an expense.

### Cash Expense
An expense paid immediately (cash outlay). Used for transactions that do not involve a vendor bill.

## Bounded Context Boundaries

The Purchasing context is a **core subdomain** that collaborates closely with:

- **Ledger Context**: Posts journal entries for bills, loan payments, and cash expenses.
- **Identity Context**: Uses the user ID for data isolation.
- **PeriodClose Context**: Ensures that manual adjusting entries for purchasing‑related adjustments (e.g., accruals) are posted within open periods.

The Purchasing context does not handle:

- **Customer transactions** (handled by Sales context).
- **General journal entries** (handled by Ledger context).
- **Period closing** (handled by PeriodClose context).

## Domain Model

### Aggregate Roots
1. **Vendor**: Enforces that the vendor name is provided and email is valid (if present). Maintains the subsidiary balance (accounts payable).
2. **VendorBill**: Ensures bill number uniqueness per user and that amount is positive.
3. **Loan**: Tracks principal, interest rate, and term. Ensures principal is positive.

### Value Objects
- `BillNumber`: Validates length and format.
- `Money`: Positive decimal with up to two decimal places.
- `LoanTerm`: Positive integer (months).

### Domain Events
- `VendorCreated`
- `VendorBillRecorded`
- `LoanPaymentRecorded`
- `CashExpenseRecorded`

## Workflows

### 1. Create Vendor
**Command**: `CreateVendor`
**Steps**:
1. Validate vendor name and email.
2. Persist the vendor with a zero balance.
3. Return the created vendor.

**Errors**:
- `InvalidVendorName`
- `InvalidVendorEmail`

### 2. Record Vendor Bill
**Command**: `RecordVendorBill`
**Steps**:
1. Validate bill data (number, amount, date, due date).
2. Verify the vendor exists.
3. Ensure the bill number is unique for the user.
4. Find the default accounts payable and expense accounts.
5. Post a journal entry (debit Expense, credit Accounts Payable).
6. Create the vendor bill record linked to the journal entry.
7. Update the vendor’s subsidiary balance.
8. Return the recorded bill.

**Errors**:
- `InvalidBillNumber`
- `DuplicateBillNumber`
- `VendorNotFound`
- `AccountNotFound`

### 3. Record Loan Payment
**Command**: `RecordLoanPayment`
**Steps**:
1. Validate principal amount, interest amount, date, and vendor.
2. Verify the vendor exists and has an associated loan.
3. Ensure the payment does not exceed the remaining loan principal.
4. Find the default cash, notes payable, and interest expense accounts.
5. Post a journal entry (debit Notes Payable for principal, debit Interest Expense for interest, credit Cash).
6. Create the loan payment record linked to the journal entry.
7. Update the loan principal (reduce).
8. Return the loan payment.

**Errors**:
- `VendorNotFound`
- `LoanNotFound`
- `PaymentExceedsPrincipal`

### 4. Record Cash Expense
**Command**: `RecordCashExpense`
**Steps**:
1. Validate amount, date, vendor, and expense category.
2. Verify the vendor exists.
3. Find the default cash and expense accounts (based on category).
4. Post a journal entry (debit Expense, credit Cash).
5. Create the cash expense record linked to the journal entry.
6. Return the cash expense.

**Errors**:
- `VendorNotFound`
- `AccountNotFound`

## Directory Structure

```
src/bounded-contexts/purchasing/
├── domain/
│   ├── purchasing.ts         # Vendor, VendorBill, Loan, LoanPayment, CashExpense and validation
│   ├── errors.ts             # Context‑specific error subtypes
│   └── purchasing.test.ts    # Unit tests for domain logic
├── application/
│   ├── createVendorWorkflow.ts
│   ├── recordVendorBillWorkflow.ts
│   ├── recordLoanPaymentWorkflow.ts
│   ├── recordCashExpenseWorkflow.ts
│   └── *.test.ts              # Workflow unit tests
├── infrastructure/
│   ├── vendorRepo.ts
│   ├── vendorBillRepo.ts
│   ├── loanRepo.ts
│   ├── loanPaymentRepo.ts
│   ├── cashExpenseRepo.ts
│   └── *.test.ts              # Repository integration tests
└── Purchasing-Context.md     (this file)
```

## Dependencies

### Internal Dependencies
- **Ledger Context**: For posting journal entries and retrieving default accounts.
- **Shared Types**: `Result<T, AppError>`, `AppError` subtypes, validation helpers.

### External Dependencies
- **Prisma Client**: For database persistence.
- **Ramda**: Used for functional composition.

## API Routes

The context exposes the following HTTP endpoints (see `src/api/routes/purchasing.ts`):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/purchasing/vendors` | Create a new vendor |
| GET  | `/api/purchasing/vendors` | List vendors for a user |
| POST | `/api/purchasing/vendor-bills` | Record a vendor bill |
| POST | `/api/purchasing/loan-payments` | Record a loan payment |
| POST | `/api/purchasing/cash-expenses` | Record a cash expense |
| GET  | `/api/purchasing/health` | Health check |

## Error Handling

All operations return a `Result<T, AppError>` where errors are categorized as:

- **DomainFailure**: Business‑rule violations (e.g., duplicate bill number, invalid payment amount).
- **InfrastructureFailure**: Database errors.
- **ApplicationFailure**: Request‑validation errors (e.g., missing fields).

Error mapping to HTTP status codes is done in the API layer (`errorMapper.ts`).

## Testing Strategy

### Unit Tests
- **Domain**: Test validation of vendor, bill, loan payment, etc.
- **Workflows**: Mock dependencies to test business logic.

### Integration Tests
- **API Routes**: Use `supertest` to verify endpoint behavior with a real database.
- **Repository**: Test database operations with a real test database.

### Key Test Scenarios
1. Vendor creation with invalid email.
2. Vendor bill recording with duplicate bill number.
3. Loan payment that exceeds the remaining principal.
4. Cash expense with a non‑existent vendor.

## How It Fits into the Cashlint System

The Purchasing context is a **core subdomain** that implements the “Money Out” user workflow. It is responsible for recognizing expenses and tracking what the business owes to vendors and lenders. Without this context, the system would not be able to generate accounts payable or record expense transactions, making accrual accounting incomplete.

## Future Enhancements

1. **Bill Payment Scheduling**: Allow scheduling of future bill payments.
2. **Recurring Bills**: Automatically generate bills on a schedule (e.g., rent).
3. **Vendor Credit**: Handle vendor credits and refunds.
4. **Loan Amortization Schedule**: Generate a schedule of future loan payments.
5. **Expense Categorization**: Allow users to define custom expense categories.

## Related Documentation

- [Cashlint System Design and Glossary](../contexts/Cashlint%20System%20Design%20and%20Glossary.docx)
- [Purchasing API Tests](../../api/routes/purchasing.test.md)
- [Functional Programming Error Handling Principles](../contexts/Functional%20Programming%20Error%20Handling%20Principles.md)
