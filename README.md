# Cashlint – Accrual-based Accounting System

Cashlint is a double-entry, accrual-basis accounting application designed for sole proprietors and single-member entities (freelancers, one-person service businesses, etc.). It provides isolated data sandboxes per user, a complete chart of accounts, and supports core accounting workflows (sales, purchasing, ledger, period close, and reporting) while enforcing strict accounting invariants.

---

## 📋 Project Overview

- **Version**: 1.0
- **Core Domain**: Accrual‑basis double‑entry bookkeeping with per‑user isolation.
- **Target User**: Freelancers, solo entrepreneurs, small business owners.
- **Accounting Method**: **Accrual only** – revenue recognized when earned, expenses when incurred.
- **Monetary Units**: Generic (user can assume USD, GBP, etc.); no currency conversions.
- **Tech Stack**:
  - Node.js LTS + Express + TypeScript
  - Prisma ORM with MariaDB (MySQL‑compatible)
  - Vitest for testing
  - Cookie‑based sessions (1‑hour idle expiry)
  - OpenAPI 3.x compliant API with cookie auth

---

## 🧱 Architecture & Bounded Contexts

The system is organized into six bounded contexts, each with its own domain model, application workflows, and infrastructure:

1. **Identity** – User creation, session isolation, and data sandbox reset.
2. **Ledger** – Single source of truth for double‑entry journal entries and account balances.
3. **Sales** – Revenue recognition, customer invoices, cash sales, and customer deposits.
4. **Purchasing** – Expense recognition, vendor bills, loan payments, and cash expenses.
5. **PeriodClose** – Adjusting entries and period‑closing procedures.
6. **Reporting** – Pure read‑model projections for the four standard financial statements.

Each context follows a **functional core, imperative shell** pattern:
- **Domain**: Pure, side‑effect‑free business logic and validation.
- **Application**: Composed workflows that orchestrate domain logic and infrastructure.
- **Infrastructure**: Repository implementations, external service adapters.

---

## 📁 Project Structure

```
src/
├── api/                         # Express server and route definitions
│   ├── routes/                  # HTTP handlers per bounded context
│   ├── server.ts
│   └── openapi.yaml             # OpenAPI 3.x specification
├── bounded-contexts/
│   ├── identity/                # Identity context
│   │   ├── domain/              # User aggregate, validation, invariants
│   │   ├── application/         # createUserWorkflow, etc.
│   │   └── infrastructure/      # User repository, session handling
│   ├── ledger/                  # Ledger context
│   ├── sales/                   # Sales context
│   ├── purchasing/              # Purchasing context (to be implemented)
│   ├── period-close/            # PeriodClose context (to be implemented)
│   └── reporting/               # Reporting context (to be implemented)
├── common/                      # Cross‑cutting concerns
│   ├── types/                   # Result<T>, AppError, etc.
│   └── infrastructure/          # Database client, logger
└── shared/                      # Shared utilities
```

---

## 🧪 Testing

The project uses **Vitest** with two test projects:

- **Unit tests** (`vitest --project unit`):
  - Test pure domain logic (no I/O).
  - Located in `src/**/domain/*.test.ts`.
- **Integration tests** (`vitest --project integration`):
  - Test workflows with real database (MySQL via Docker).
  - Located in `src/**/application/*.test.ts` and `src/**/infrastructure/*.test.ts`.

**Run all tests**:
```bash
pnpm test:all
```

**Run unit tests only**:
```bash
pnpm test:unit
```

**Run integration tests only**:
```bash
pnpm test:integration
```

Integration tests require a running MariaDB instance (provided by `docker-compose up`).

---

## 🚀 Getting Started

### Prerequisites
- Node.js (LTS)
- pnpm
- Docker & Docker Compose

### Setup
1. Clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the MariaDB database:
   ```bash
   docker-compose up -d
   ```
4. Run database migrations:
   ```bash
   pnpm prisma:migrate
   ```
   (Alternatively, use `npx prisma migrate dev`.)
5. Generate Prisma client:
   ```bash
   pnpm prisma:generate
   ```
   (Alternatively, use `npx prisma generate`.)
6. Start the development server:
   ```bash
   pnpm dev
   ```
   The API will be available at `http://localhost:3000`.

### Environment Variables
Create a `.env` file in the project root (see `.env.example` for reference):
```
DATABASE_URL="mysql://root:password@localhost:3306/cashlint"
PORT=3000
```

---

## 📚 Key Domain Concepts

### Default Chart of Accounts
Every user receives a predefined chart of accounts (codes are immutable, names are renamable):

| Code | Name                          | Type          | Normal Balance |
|------|-------------------------------|---------------|----------------|
| 101  | Cash                          | Asset         | Debit          |
| 111  | Accounts Receivable           | Asset         | Debit          |
| 191  | Equipment / Fixed Assets      | Asset         | Debit          |
| 191.1| Accumulated Depreciation      | Contra‑Asset  | Credit         |
| 141  | Supplies                      | Asset         | Debit          |
| 145  | Prepaid Insurance             | Asset         | Debit          |
| 201  | Accounts Payable              | Liability     | Credit         |
| 251  | Notes Payable                 | Liability     | Credit         |
| 255  | Unearned Revenue              | Liability     | Credit         |
| 301  | Owner, Capital                | Equity        | Credit         |
| 302  | Owner, Drawing                | Equity        | Debit          |
| 401  | Service Revenue               | Revenue       | Credit         |
| 501  | Salaries / Subcontractor Fee  | Expense       | Debit          |
| 502  | Rent Expense                  | Expense       | Debit          |
| 503  | Office Supplies Expense       | Expense       | Debit          |
| 504  | Training Expense              | Expense       | Debit          |
| 505  | Interest / Late Fees          | Expense       | Debit          |
| 506  | Repairs & Maintenance Expense | Expense       | Debit          |

### User Workflows
The UI is designed around two primary wizards:

1. **Money In Wizard** – Record client payments.
   - Choose between applying to an existing invoice, recording a cash sale, or treating the amount as an advance (unearned revenue).
2. **Money Out Wizard** – Record payments to vendors.
   - Pay an existing bill, record a cash expense, or split a loan payment between principal and interest.

Both wizards ensure accrual‑basis timing is respected.

### Financial Statements
Four standard statements are generated from the event stream:
- **Income Statement** – Revenue earned minus expenses incurred.
- **Statement of Owner’s Equity** – Beginning capital + contributions + profit – drawings.
- **Balance Sheet** – Assets = Liabilities + Equity.
- **Statement of Cash Flows** – Explains cash movements (operating, investing, financing).

---

## 🔧 Development Guidelines

### Coding Style
- **Immutability**: Prefer `const`, readonly properties, and return‑new‑object patterns.
- **Pure Functions**: Domain logic must be side‑effect‑free.
- **Explicit Errors**: Use `Result<T, AppError>` instead of exceptions for domain failures.
- **Types over Interfaces**: Favor TypeScript `type` definitions.
- **No Semicolons**: Follow the project’s no‑semicolon style.

### Error Handling
Errors are categorized as:
- **Domain failures** – business rule violations (e.g., duplicate username, unbalanced journal entry).
- **Application failures** – orchestration issues (e.g., missing payload).
- **Infrastructure failures** – I/O errors (e.g., database unreachable).

All errors are propagated via the `Result` monad and mapped to appropriate HTTP status codes at the API boundary.

### Adding a New Bounded Context
1. Create the directory under `src/bounded-contexts/`.
2. Define domain aggregates, value objects, and invariants.
3. Implement application workflows (use the `Result` pattern).
4. Provide infrastructure repositories (Prisma‑based).
5. Add API routes (if needed) and update the OpenAPI spec.
6. Write unit and integration tests.

---

## 🗺️ Roadmap (v2+)

Planned future features (explicitly out of scope for v1):
1. Perpetual inventory & COGS tracking.
2. Bank feeds / CSV import / reconciliation.
3. Automatic monthly depreciation.
4. Automatic accrued interest on loans.
5. Recurring invoices.
6. Prepaid expenses amortization.
7. Project / class / tag tracking.
8. Payroll / subcontractor 1099 tracking.
9. Multi‑currency support.
10. Full authentication (passwords, login).
11. Multi‑user / accountant collaboration.

---

## 📄 License

MIT – see [LICENSE](LICENSE) file.