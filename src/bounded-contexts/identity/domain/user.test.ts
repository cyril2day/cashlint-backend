import { describe, it, expect } from 'vitest'
import { validateUsername } from '@/bounded-contexts/identity/domain/user'

describe('Identity Context: User Domain Calculations', () => {
  describe('validateUsername', () => {
    it('should accept a valid alphanumeric username with underscores', () => {
      expect.assertions(1)

      const expected = 'valid_user_1'
      const result = validateUsername(expected)

      expect(result).toEqual({ isSuccess: true, value: expected })
    })

    it('should normalize uppercase inputs to lowercase', () => {
      expect.assertions(1)

      const expected = 'Valid_User'
      const result = validateUsername(expected)

      expect(result).toEqual({ isSuccess: true, value: expected.toLocaleLowerCase() })
    })

    it('should reject usernames shorter than 3 characters', () => {
      expect.assertions(2)

      const invalidUsername = 'ab'
      const result = validateUsername(invalidUsername)

      expect(result.isSuccess).toBe(false)

      if (!result.isSuccess) {
        expect(result.error.message).toMatch(/at least 3 characters/)
      }
    })

    it('should reject usernames with spaces', () => {
      expect.assertions(2)

      const invalidUsernameWithSpace = 'space user'
      const result = validateUsername(invalidUsernameWithSpace)

      expect(result.isSuccess).toBe(false)

       if (!result.isSuccess) {
        expect(result.error.message).toMatch(/alphanumeric and underscores only/)
      }
    })

    it('should reject non-alphanumeric characters (symbols)', () => {
      expect.assertions(1)

      const invalidUsernameWithSymbols = 'user@name'
      const result = validateUsername(invalidUsernameWithSymbols)

      expect(result.isSuccess).toBe(false)
    })
  })
})