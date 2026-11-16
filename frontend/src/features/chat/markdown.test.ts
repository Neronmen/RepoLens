import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('parseInline', () => {
  it('nhận code, chữ đậm và chữ thường', () => {
    expect(parseInline('Gọi `unsign` để **kiểm tra** chữ ký')).toEqual([
      { kind: 'text', text: 'Gọi ' },
      { kind: 'code', text: 'unsign' },
      { kind: 'text', text: ' để ' },
      { kind: 'bold', children: [{ kind: 'text', text: 'kiểm tra' }] },
      { kind: 'text', text: ' chữ ký' },
    ])
  })

  it('nhận trích dẫn một khoảng dòng và một dòng', () => {
    expect(parseInline('xem [src/a.py:3-9] và [README.md:5]')).toMatchObject([
      { kind: 'text' },
      { kind: 'cite', path: 'src/a.py', start: 3, end: 9 },
      { kind: 'text' },
      { kind: 'cite', path: 'README.md', start: 5, end: 5 },
    ])
  })

  it('nhận dạng gộp nhiều khoảng dòng và nhiều file', () => {
    const summary = (text: string) =>
      parseInline(text).flatMap((n) => (n.kind === 'cite' ? [[n.path, n.start, n.end]] : []))

    expect(summary('[a.py:1-2, 9]')).toEqual([['a.py', 1, 2], ['a.py', 9, 9]])
    expect(summary('[a.py:1-2, 9, 20-30]')).toEqual([['a.py', 1, 2], ['a.py', 9, 9], ['a.py', 20, 30]])
    expect(summary('[a.py:1-2; b.py:3]')).toEqual([['a.py', 1, 2], ['b.py', 3, 3]])
    expect(summary('[src/a.py:1-2, README.md:1]')).toEqual([['src/a.py', 1, 2], ['README.md', 1, 1]])
  })

  it('chấp nhận các cách viết số dòng khác nhau', () => {
    for (const raw of ['[x/y.py:L3-L4]', '[x/y.py: 3–4]', '[`x/y.py`:3-4]']) {
      expect(parseInline(raw)).toMatchObject([{ kind: 'cite', path: 'x/y.py', start: 3, end: 4 }])
    }
  })

  it('đảo số nếu model viết ngược', () => {
    expect(parseInline('[a/b.py:9-3]')).toMatchObject([{ kind: 'cite', start: 3, end: 9 }])
  })

  it('không nhận nhầm cú pháp thường thành trích dẫn', () => {
    for (const text of ['data[1:2]', 'lúc [10:30]', '[localhost:8080]', '[không phải]', '[a:1]']) {
      expect(parseInline(text).some((n) => n.kind === 'cite')).toBe(false)
    }
  })

  it('giữ nguyên chữ của thứ không phải trích dẫn', () => {
    expect(parseInline('xem [ghi chú: quan trọng]')).toEqual([
      { kind: 'text', text: 'xem ' },
      { kind: 'text', text: '[ghi chú: quan trọng]' },
    ])
  })

  it('HTML trong nội dung chỉ là chữ, không bao giờ thành thẻ', () => {
    const nodes = parseInline('<img src=x onerror=alert(1)> và **<b>**')
    expect(JSON.stringify(nodes)).toContain('<img src=x onerror=alert(1)>')
    expect(nodes.every((n) => ['text', 'bold', 'code', 'cite'].includes(n.kind))).toBe(true)
  })
})

describe('parseMarkdown', () => {
  it('tách tiêu đề, đoạn văn và danh sách', () => {
    const blocks = parseMarkdown('### Vị trí\n\nMột đoạn\nnối dòng.\n\n* mục 1\n* mục 2\n1. bước một\n2. bước hai')
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'list'])
    expect(blocks[0]).toMatchObject({ level: 3 })
    expect(blocks[2]).toMatchObject({ ordered: false })
    expect(blocks[3]).toMatchObject({ ordered: true })
    if (blocks[2].kind === 'list') expect(blocks[2].items).toHaveLength(2)
    if (blocks[1].kind === 'paragraph') expect(blocks[1].children).toEqual([{ kind: 'text', text: 'Một đoạn nối dòng.' }])
  })

  it('khối code giữ nguyên nội dung, kể cả khi chưa kịp đóng lúc đang stream', () => {
    expect(parseMarkdown('```py\nx = 1\ny = 2\n```')).toEqual([{ kind: 'code', lang: 'py', text: 'x = 1\ny = 2' }])
    expect(parseMarkdown('```py\nx = 1')).toEqual([{ kind: 'code', lang: 'py', text: 'x = 1' }])
  })

  it('trong khối code không diễn giải markdown', () => {
    const [b] = parseMarkdown('```\n# không phải tiêu đề\n* không phải danh sách\n```')
    expect(b).toMatchObject({ kind: 'code', text: '# không phải tiêu đề\n* không phải danh sách' })
  })

  it('dòng thụt vào là phần tiếp của mục danh sách', () => {
    const [list] = parseMarkdown('1. Nạp khóa\n   rồi sắp xếp\n2. Ký')
    expect(list.kind === 'list' && list.items).toHaveLength(2)
  })

  it('văn bản rỗng không ra khối nào', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('\n\n  \n')).toEqual([])
  })
})
