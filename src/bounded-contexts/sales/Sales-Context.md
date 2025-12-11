# Sales Bounded Context

## Overview

The **Sales** bounded context handles revenue recognition and customer‑related transactions in the Cashlint accrual‑based accounting system. It ensures that revenue is recorded when earned (accrual basis) by issuing sales invoices, recording cash sales, applying payments, and managing customer deposits. This context maintains subsidiary ledgers for accounts receivable and enforces business rules such as invoice uniqueness and payment matching.

## Purpose & Business Value

For a sole proprietor, tracking sales accurately is critical for understanding profitability and cash flow. The Sales context provides:

1. **Customer Management**: Create and manage customer records with contact information and subsidiary balances.
2. **Invoice Issuance**: Issue sales invoices that trigger revenue recognition and increase accounts receivable.
3. **Payment Application**: Record payments against open invoices, reducing accounts receivable and increasing cash.
4. **Cash Sales**: Record revenue earned immediately (cash sales) without an invoice.
5. **Customer Deposits**: Handle advance payments (unearned revenue) that become liabilities until revenue is earned.

This context ensures that revenue is recognized in the correct period, supporting accurate income statements and balance sheets.

## Key Concepts

### Customer
A customer is an entity to whom the business sells goods or services. A customer has:

- **Name**: A unique identifier per user (not enforced globally).
- **Email**: Optional contact information.
- **Balance**: The total outstanding amount (accounts receivable) for that customer.

### Sales Invoice
A sales invoice represents a credit sale. It includes:

- **Invoice Number**: A user‑defined unique identifier (per user).
- **Total**: The amount of revenue earned.
- **Date**: The date the revenue is recognized (invoice date).
- **Due Date**: Optional date by which payment is expected.
- **Status**: `Draft`, `Issued`, `PartiallyPaid`, `Paid`, or `Overdue`.

### Payment
A payment applied to an invoice. It includes:

- **Amount**: The amount paid.
- **Date**: The date the payment is received.
- **Method**: `Cash`, `Check`, `CreditCard`, or `BankTransfer`.
- **Reference**: Optional reference number (e.g., check number).

### Cash Sale
A sale where revenue is earned and cash is received simultaneously (no accounts receivable). Used for transactions that do not require an invoice.

### Customer Deposit
An advance payment for future goods/services. Recorded as a liability (unearned revenue) until the revenue is earned.

## Bounded Context Boundaries

The Sales context is a **core subdomain** that collaborates closely with:

- **Ledger Context**: Posts journal entries for invoices, payments, cash sales, and deposits.
- **Identity Context**: Uses the user ID for data isolation.
- **PeriodClose Context**: Ensures that manual adjusting entries for sales‑related adjustments (e.g., bad debt) are posted within open periods.

The Sales context does not handle:

- **Vendor transactions** (handled by Purchasing context).
- **General journal entries** (handled by Ledger context).
- **Period closing** (handled by PeriodClose context).

## Domain Model

### Aggregate Roots
1. **Customer**: Enforces that the customer name is provided and email is valid (if present). Maintains the subsidiary balance (accounts receivable).
2. **SalesInvoice**: Ensures invoice number uniqueness per user and that total is positive.

### Value Objects
- `InvoiceNumber`: Validates length and format.
- `Money`: Positive decimal with up to two decimal places.
- `PaymentMethod`: One of `Cash`, `Check`, `CreditCard`, `BankTransfer`.

### Domain Events
- `CustomerCreated`
- `InvoiceIssued`
- `PaymentAppliedToInvoice`
- `CashSaleRecorded`
- `CustomerDepositRecorded`

## Workflows

### 1. Create Customer
**Command**: `CreateCustomer`
**Steps**:
1. Validate customer name and email.
2. Ensure the customer does not have a duplicate name (optional, not enforced in v1).
3. Persist the customer with a zero balance.
4. Return the created customer.

**Errors**:
- `InvalidCustomerName`
- `InvalidCustomerEmail`

### 2. Issue Sales Invoice
**Command**: `IssueSalesInvoice`
**Steps**:
1. Validate invoice data (number, total, date, due date).
2. Verify the customer exists.
3. Ensure the invoice number is unique for the user.
4. Find the default accounts receivable and revenue accounts.
5. Post a journal entry (debit Accounts Receivable, credit Revenue).
6. Create the sales invoice record linked to the journal entry.
7. Update the customer’s subsidiary balance.
8. Return the issued invoice.

**Errors**:
- `InvalidInvoiceNumber`
- `DuplicateInvoiceNumber`
- `CustomerNotFound`
- `AccountNotFound`

### 3. Apply Payment to Invoice
**Command**: `ApplyPaymentToInvoice`
**Steps**:
1. Validate payment amount, date, method, and reference.
2. Verify the invoice exists and is open.
3. Ensure the payment amount does not exceed the open amount (unless overpayment is allowed).
4. Find the default cash and accounts receivable accounts.
5. Post a journal entry (debit Cash, credit Accounts Receivable).
6. Create the payment record linked to the journal entry.
7. Update the invoice status (partially paid, paid).
8. Update the customer’s subsidiary balance (reduce).
9. Return the payment.

**Errors**:
- `PaymentExceedsOpenAmount`
- `InvoiceNotFound`
- `InvalidPaymentMethod`

### 4. Record Cash Sale
**Command**: `RecordCashSale`
**Steps**:
1. Validate amount, date, customer.
2. Find the default cash and revenue accounts.
3. Post a journal entry (debit Cash, credit Revenue).
4. Create the cash sale record linked to the journal entry.
5. Return the cash sale.

**Errors**:
- `CustomerNotFound`
- `AccountNotFound`

### 5. Record Customer Deposit
**Command**: `RecordCustomerDeposit`
**Steps**:
1. Validate amount, date, customer.
2. Find the default cash and unearned revenue accounts.
3. Post a journal entry (debit Cash, credit Unearned Revenue).
4. Create the customer deposit record linked to the journal entry.
5. Return the deposit.

**Errors**:
- `CustomerNotFound`
- `AccountNotFound`

## Directory Structure

```
src/bounded-contexts/sales/
├── domain/
│   ├── sales.ts              # Customer, SalesInvoice, Payment, etc. and validation
│   ├── errors.ts             # Context‑specific error subtypes
│   └── sales.test.ts         # Unit tests for domain logic
├── application/
│   ├── createCustomerWorkflow.ts
│   ├── issueSalesInvoiceWorkflow.ts
│   ├── applyPaymentToInvoiceWorkflow.ts
│   ├── recordCashSaleWorkflow.ts
│   ├── recordCustomerDepositWorkflow.ts
│   └── *.test.ts              # Workflow unit tests
├── infrastructure/
│   ├── customerRepo.ts
│   ├── salesInvoiceRepo.ts
│   ├── paymentRepo.ts
│   ├── cashSaleRepo.ts
│   ├── customerDepositRepo.ts
│   └── *.test.ts              # Repository integration tests
└── Sales-Context.md          (this file)
```

## Dependencies

### Internal Dependencies
- **Ledger Context**: For posting journal entries and retrieving default accounts.
- **Shared Types**: `Result<T, AppError>`, `AppError` subtypes, validation helpers.

### External Dependencies
- **Prisma Client**: For database persistence.
- **Ramda**: Used for functional composition.

## API Routes

The context exposes the following HTTP endpoints (see `src/api/routes/sales.ts`):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sales/customers` | Create a new customer |
| GET  | `/api/sales/customers` | List customers for a user |
| GET  | `/api/sales/customers/{customerId}` | Get a customer by ID |
| POST | `/api/sales/invoices` | Issue a sales invoice |
| GET  | `/api/sales/invoices` | List invoices for a user |
| GET  | `/api/sales/invoices/{invoiceId}` | Get an invoice by ID |
| POST | `/api/sales/invoices/{invoiceId}/payments` | Apply a payment to an invoice |
| POST | `/api/sales/cash-sales` | Record a cash sale |
| POST | `/api/sales/customer-deposits` | Record a customer deposit |
| GET  | `/api/sales/health` | Health check |

*Note: Some endpoints (`cash‑sales`, `customer‑deposits`) return `501 Not Implemented` in the current version.*

## Error Handling

All operations return a `Result<T, AppError>` where errors are categorized as:

- **DomainFailure**: Business‑rule violations (e.g., duplicate invoice number, invalid payment amount).
- **InfrastructureFailure**: Database errors.
- **ApplicationFailure**: Request‑validation errors (e.g., missing fields).

Error mapping to HTTP status codes is done in the API layer (`errorMapper.ts`).

## Testing Strategy

### Unit Tests
- **Domain**: Test validation of customer, invoice, payment, etc.
- **Workflows**: Mock dependencies to test business logic.

### Integration Tests
- **API Routes**: Use `supertest` to verify endpoint behavior with a real database.
- **Repository**: Test database operations with a real test database.

### Key Test Scenarios
1. Customer creation with invalid email.
2. Invoice issuance with duplicate invoice number.
3. Payment that exceeds the open invoice amount.
4. Cash sale with a non‑existent customer.

## How It Fits into the Cashlint System

The Sales context is a **core subdomain** that implements the “Money In” user workflow. It is responsible for recognizing revenue and tracking what customers owe the business. Without this context, the system would not be able to generate accounts receivable or record sales transactions, making accrual accounting impossible.

## Future Enhancements

1. **Invoice Templates**: Allow users to customize invoice layout and fields.
2. **Recurring Invoices**: Automatically generate invoices on a schedule.
3. **Overpayment Handling**: Allow overpayments to be applied to future invoices or refunded.
4. **Invoice Reminders**: Automatically send reminders for overdue invoices.
5. **Sales Tax Calculation**: Integrate tax calculation based on jurisdiction.

## Related Documentation

- [Cashlint System Design and Glossary](../contexts/Cashlint%20System%20Design%20and%20Glossary.docx)
- [Sales API Tests](../../api/routes/sales.test.md)
- [Functional Programming Error Handling Principles](../contexts/Functional%20Programming%20Error%20Handling%20Principles.md)
