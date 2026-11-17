import { beforeEach, describe, expect, it } from 'vitest'
import { recallRepo, rememberRepo } from './recent'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  })
})

describe('recent repos', () => {
  it('nhớ repo ứng với id', () => {
    rememberRepo(3, 'pallets', 'flask')
    expect(recallRepo(3)).toBe('pallets/flask')
    expect(recallRepo(4)).toBeNull()
  })

  it('bỏ qua dữ liệu lạ trong bộ nhớ thay vì dùng bừa', () => {
    store.set('repolens.recent', JSON.stringify({ 5: '../../etc/passwd' }))
    expect(recallRepo(5)).toBeNull()
    store.set('repolens.recent', 'không phải json')
    expect(recallRepo(5)).toBeNull()
  })

  it('chỉ giữ một số repo gần nhất', () => {
    for (let i = 1; i <= 40; i++) rememberRepo(i, 'a', `r${i}`)
    expect(recallRepo(1)).toBeNull()
    expect(recallRepo(40)).toBe('a/r40')
  })
})
