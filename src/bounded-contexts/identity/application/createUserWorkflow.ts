import { validateUsername } from '@/bounded-contexts/identity/domain/user'
import { createUserWithDefaultAccounts } from '@/bounded-contexts/identity/infrastructure/userWithAccountsRepo'
import { andThenAsync } from '@/common/types/result'

/**
 * Create User Workflow - Application Layer
 * 
 * Composes domain validation with infrastructure persistence using railway-oriented programming.
 * This workflow orchestrates the business process of creating a user:
 * 1. Validate username (pure domain logic)
 * 2. Persist user AND create default Chart of Accounts in a single transaction (infrastructure I/O)
 * 
 * Uses andThenAsync to chain the async infrastructure operation after the pure domain validation.
 */
export const createUserWorkflow = async (username: string) => {
  // Start with domain validation (pure calculation)
  const validationResult = validateUsername(username)
  
  // Chain with infrastructure persistence (async action) that also creates default accounts
  const workflowResult = await andThenAsync(createUserWithDefaultAccounts)(validationResult)
  
  return workflowResult
}