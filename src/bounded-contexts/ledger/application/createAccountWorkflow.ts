import { validateAccountCode, validateAccountName, Account, AccountType, NormalBalance } from '../domain/ledger'
import { createAccount, findAccountByCode } from '../infrastructure/accountRepo'
import { Failure } from '@/common/types/result'
import { DomainFailure } from '@/common/types/errors'
import { LedgerDomainSubtype } from '../domain/errors'

/**
 * Workflow input: raw data from command (API request).
 */
export type CreateAccountCommand = {
  userId: string
  code: string
  name: string
  type: AccountType
  normalBalance: NormalBalance
}

/**
 * Pure validation: check that the account code is unique for the user.
 * This is a domain rule, but it requires infrastructure (checking existing accounts).
 * We'll separate the pure validation (syntax) from the infrastructure check (uniqueness) in the workflow.
 */
const validateAccountUniqueness = (userId: string, code: string) => 
  findAccountByCode(userId, code).then(result => {
    if (result.isSuccess && result.value !== null) {
      return Promise.resolve(
        DomainFailure(
          'DuplicateAccountCode' as LedgerDomainSubtype,
          `Account code ${code} already exists for this user.`
        )
      )
    }
    // No duplicate found, proceed.
    return Promise.resolve(null)
  })

/**
 * Create Account Workflow - Application Layer
 * 
 * Composes domain validation with infrastructure uniqueness check and persistence.
 * Steps:
 * 1. Validate account code syntax (pure)
 * 2. Validate account name syntax (pure)
 * 3. Check uniqueness of account code for the user (infrastructure)
 * 4. Persist account (infrastructure)
 * 
 * Returns a Promise<Result<Account>>.
 */
export const createAccountWorkflow = async (command: CreateAccountCommand) => {
  // Step 1 & 2: Pure validations
  const codeValidation = validateAccountCode(command.code)
  const nameValidation = validateAccountName(command.name)

  // If either validation fails, return the failure as a Result<Account>.
  if (!codeValidation.isSuccess) {
    return Promise.resolve(Failure(codeValidation.error))
  }
  if (!nameValidation.isSuccess) {
    return Promise.resolve(Failure(nameValidation.error))
  }

  // Step 3: Uniqueness check (async)
  const uniquenessError = await validateAccountUniqueness(command.userId, command.code)
  if (uniquenessError) {
    return Promise.resolve(Failure(uniquenessError))
  }

  // Step 4: Persist
  const accountToCreate: Omit<Account, 'id' | 'createdAt' | 'updatedAt'> = {
    userId: command.userId,
    code: codeValidation.value,
    name: nameValidation.value,
    type: command.type,
    normalBalance: command.normalBalance,
  }

  return createAccount(accountToCreate)
}