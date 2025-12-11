import { validateVendor, Vendor } from '../domain/purchasing'
import { createVendor } from '../infrastructure/vendorRepo'
import { Result } from '@/common/types/result'

export type CreateVendorCommand = {
  userId: string
  name: string
  email?: string
}

export const createVendorWorkflow = async (command: CreateVendorCommand): Promise<Result<Vendor>> => {
  // Step 1: Pure validation
  const validationResult = validateVendor(command)
  if (!validationResult.isSuccess) {
    return validationResult
  }

  // Step 2: Create vendor (no duplicate check for now)
  return createVendor(validationResult.value)
}