import { describe, expect, it } from 'vitest'
import en from './en'
import vi from './vi'
import { translate, translatePlural } from './translate'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('kho chữ', () => {
  it('tiếng Việt có đủ mọi khóa của tiếng Anh và ngược lại', () => {
    const enKeys = Object.keys(en).filter((k) => !/\.(one|few|many|zero|two)$/.test(k))
    const viKeys = Object.keys(vi).filter((k) => !/\.(one|few|many|zero|two)$/.test(k))
    expect(viKeys.sort()).toEqual(enKeys.sort())
  })

  it('không có chuỗi rỗng', () => {
    for (const [k, v] of [...Object.entries(en), ...Object.entries(vi)]) {
      expect(v.trim(), k).not.toBe('')
    }
  })

  it('hai ngôn ngữ dùng cùng các {tham số}, không ngôn ngữ nào bỏ sót hay thêm', () => {
    const viDict = vi as Record<string, string>
    for (const [k, v] of Object.entries(en)) {
      // tiếng Việt không có số ít/số nhiều: đối chiếu với khóa `.other`
      const viKey = k in viDict ? k : k.replace(/\.(one|few|many)$/, '.other')
      expect(placeholders(viDict[viKey]), k).toEqual(placeholders(v))
    }
  })
})

describe('translate', () => {
  it('thay tham số, giữ nguyên {tên} nếu thiếu để lỗi lộ ra', () => {
    expect(translate('en', 'topbar.counts', { files: 30, chunks: 57 })).toBe('30 files · 57 chunks')
    expect(translate('vi', 'topbar.counts', { files: 30, chunks: 57 })).toBe('30 tệp · 57 đoạn')
    expect(translate('en', 'topbar.counts', { files: 30 })).toBe('30 files · {chunks} chunks')
  })

  it('số ít và số nhiều của tiếng Anh, tiếng Việt chỉ có một dạng', () => {
    expect(translatePlural('en', 'chat.toolCalls', 1)).toBe('1 tool call')
    expect(translatePlural('en', 'chat.toolCalls', 5)).toBe('5 tool calls')
    expect(translatePlural('vi', 'chat.toolCalls', 1)).toBe('1 lần gọi công cụ')
    expect(translatePlural('vi', 'chat.toolCalls', 5)).toBe('5 lần gọi công cụ')
  })
})
