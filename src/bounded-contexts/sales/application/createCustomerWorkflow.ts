import { validateCustomer, Customer } from '../domain/sales'
import { createCustomer } from '../infrastructure/customerRepo'
import { Result } from '@/common/types/result'

export type CreateCustomerCommand = {
  userId: string
  name: string
  email?: string
}

export const createCustomerWorkflow = async (command: CreateCustomerCommand): Promise<Result<Customer>> => {
  // Step 1: Pure validation
  const validationResult = validateCustomer(command)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Step 2: Create customer (no duplicate check for now)
  return createCustomer(validationResult.value)
}