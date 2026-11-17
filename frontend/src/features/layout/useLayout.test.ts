import { describe, expect, it } from 'vitest'
import { LIMITS, maxCodeWidth } from './useLayout'

describe('maxCodeWidth', () => {
  it('chừa tối thiểu chỗ cho khung chat', () => {
    // 1400 - 248 (file) - 380 (chat tối thiểu) = 772
    expect(maxCodeWidth(1400, 248)).toBe(772)
  })

  it('không bao giờ nhỏ hơn mức tối thiểu của khung code', () => {
    expect(maxCodeWidth(900, 248)).toBe(LIMITS.code.min)
  })

  it('không vượt mức tối đa dù màn rất rộng', () => {
    expect(maxCodeWidth(4000, 0)).toBe(LIMITS.code.max)
  })
})
