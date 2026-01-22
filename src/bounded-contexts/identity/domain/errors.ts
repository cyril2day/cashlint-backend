import { DomainFailure } from '@/common/types/errors'

export const UserNotFound = (message: string = 'User not found') =>
  DomainFailure('UserNotFound', message)

export const InvalidSession = (message: string = 'Invalid session') =>
  DomainFailure('InvalidSession', message)

export const SessionExpired = (message: string = 'Session has expired') =>
  DomainFailure('SessionExpired', message)