import { validateUsername } from '@/bounded-contexts/identity/domain/user'
import { User } from '@/prisma/client'
import { findUserByUsername } from '@/bounded-contexts/identity/infrastructure/userRepo'
import { createSession } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { andThenAsync } from '@/common/types/result'
import type { Session } from '@/bounded-contexts/identity/domain/session'

/**
 * Login Workflow - Application Layer
 * 
 * Orchestrates the login process:
 * 1. Validate username format (pure domain logic)
 * 2. Look up user by username (infrastructure I/O)
 * 3. Create a new session for the user (infrastructure I/O)
 * 
 * Uses railway-oriented programming with andThenAsync to chain async operations.
 */
export const loginWorkflow = async (username: string) => {
  // Start with domain validation (pure calculation)
  const validationResult = validateUsername(username)

  // Chain with user lookup (async action)
  const userResult = await andThenAsync(findUserByUsername)(validationResult)

  // Chain with session creation (async action) using the user's id
  const sessionResult = await andThenAsync((user: User) => createSession(user.id))(userResult)

  return sessionResult
}