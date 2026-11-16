/** Đọc phần markdown mà model hay viết (tiêu đề, danh sách, khối code, đậm, `code`)
 * thành một cây dữ liệu đơn giản.
 *
 * Mình tự viết thay vì dùng thư viện markdown vì chỉ cần vài thứ, và vì kết quả
 * được dựng thành phần tử React thật (không bao giờ dùng innerHTML), nên nội dung
 * lạ từ repo hay từ model không thể chèn được HTML hay script vào trang.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'bold'; children: Inline[] }
  | { kind: 'cite'; path: string; start: number; end: number; raw: string }

export type Block =
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; lang: string; text: string }

// Một cặp ngoặc vuông, cho phép lồng một tầng (file kiểu `app/[id]/page.tsx`).
const BRACKET = '\\[((?:[^\\[\\]\\n]|\\[[^\\[\\]\\n]*\\]){1,400})\\]'
const TOKEN = new RegExp(`\`([^\`\\n]+)\`|\\*\\*(.+?)\\*\\*|${BRACKET}`, 'g')
// "đường/dẫn.py:12-34" hoặc "đường/dẫn.py:L12", có thể kèm "..., 50" phía sau
const CITE_ENTRY = /^`?([\w./@+-]+(?:\[[^\]\s]*\][\w./@+-]*)*)`?\s*:\s*L?(\d{1,7})(?:\s*[-–]\s*L?(\d{1,7}))?/
// các khoảng dòng viết nối tiếp của cùng một file: ", 50" hoặc ", 60-70"
const EXTRA_RANGE = /^\s*,\s*L?(\d{1,7})(?:\s*[-–]\s*L?(\d{1,7}))?/

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) })
    if (m[1] !== undefined) {
      out.push({ kind: 'code', text: m[1] })
    } else if (m[2] !== undefined) {
      out.push({ kind: 'bold', children: parseInline(m[2]) })
    } else {
      out.push(...parseBracket(m[3], m[0]))
    }
    last = at + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}

/** `[a.py:1-2, b.py:3]` có thể chứa nhiều trích dẫn; thứ không phải trích dẫn thì giữ nguyên chữ. */
function parseBracket(inner: string, raw: string): Inline[] {
  const parts = inner.split(/\s*;\s*|,\s*(?=[^\d\sL])/)
  const cites: Inline[] = []
  for (const part of parts) {
    const text = part.trim()
    const m = CITE_ENTRY.exec(text)
    if (!m || !(m[1].includes('/') || m[1].includes('.'))) return [{ kind: 'text', text: raw }]
    const push = (a: string, b?: string) => {
      const start = Number(a)
      const end = b ? Number(b) : start
      cites.push({ kind: 'cite', path: m[1], start: Math.min(start, end), end: Math.max(start, end), raw })
    }
    push(m[2], m[3])
    // "[a.py:1-2, 9]": phần sau dấu phẩy là khoảng dòng khác của cùng file
    for (let rest = text.slice(m[0].length), x = EXTRA_RANGE.exec(rest); x; x = EXTRA_RANGE.exec(rest)) {
      push(x[1], x[2])
      rest = rest.slice(x[0].length)
    }
  }
  return cites
}

const FENCE = /^```(\w*)\s*$/
const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[*-]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let para: string[] = []

  const flushPara = () => {
    if (para.length) blocks.push({ kind: 'paragraph', children: parseInline(para.join(' ')) })
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const fence = FENCE.exec(line)
    if (fence) {
      flushPara()
      const body: string[] = []
      i++
      // câu trả lời đang stream nên khối code có thể chưa kịp đóng: cứ lấy hết phần đã có
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      blocks.push({ kind: 'code', lang: fence[1], text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushPara()
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, children: parseInline(heading[2]) })
      continue
    }

    const item = BULLET.exec(line) ?? NUMBERED.exec(line)
    if (item) {
      flushPara()
      const ordered = !BULLET.test(line)
      const prev = blocks[blocks.length - 1]
      // các mục liền nhau cùng loại gộp vào một danh sách
      if (prev?.kind === 'list' && prev.ordered === ordered) prev.items.push(parseInline(item[1]))
      else blocks.push({ kind: 'list', ordered, items: [parseInline(item[1])] })
      continue
    }

    if (!line.trim()) {
      flushPara()
      continue
    }

    // dòng thụt vào ngay sau một mục danh sách là phần tiếp theo của mục đó
    const prev = blocks[blocks.length - 1]
    if (para.length === 0 && prev?.kind === 'list' && /^\s+\S/.test(line)) {
      prev.items[prev.items.length - 1].push(...parseInline(' ' + line.trim()))
      continue
    }
    para.push(line.trim())
  }
  flushPara()
  return blocks
}
