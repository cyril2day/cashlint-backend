import { deleteSession } from '@/bounded-contexts/identity/infrastructure/sessionRepo'
import { Result } from '@/common/types/result'

/**
 * Logout Workflow - Application Layer
 *
 * Deletes a session (logs out the user).
 * If the session does not exist, still returns success (already logged out).
 * Only fails on infrastructure errors.
 */
export const logoutWorkflow = (sessionId: string): Promise<Result<void>> =>
  deleteSession(sessionId)