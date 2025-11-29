import { expect, test } from 'vitest'
import { flatten } from '@/shared/utils/flatten'

test('flatten basic nesting', () => {
  expect(flatten([[1, 2], [3, 4], []])).toEqual([1, 2, 3, 4])
})

test('flatten empty array', () => {
  expect(flatten([])).toEqual([])
})

test('flatten mixed empty/non-empty', () => {
  expect(flatten([[], [], [5]])).toEqual([5])
})