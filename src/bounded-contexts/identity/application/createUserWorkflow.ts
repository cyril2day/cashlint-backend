import { validateUsername } from '@/bounded-contexts/identity/domain/user'
import { createUser } from '@/bounded-contexts/identity/infrastructure/userRepo'
import { andThenAsync } from '@/common/types/result'
import { User } from '@/prisma/client'

/**
 * Create User Workflow - Application Layer
 * 
 * Composes domain validation with infrastructure persistence using railway-oriented programming.
 * This workflow orchestrates the business process of creating a user:
 * 1. Validate username (pure domain logic)
 * 2. Persist user to database (infrastructure I/O)
 * 
 * Uses andThenAsync to chain the async infrastructure operation after the pure domain validation.
 */
export const createUserWorkflow = async (username: string) => {
  // Start with domain validation (pure calculation)
  const validationResult = validateUsername(username)
  
  // Chain with infrastructure persistence (async action)
  const workflowResult = await andThenAsync(createUser)(validationResult)
  
  return workflowResult
}