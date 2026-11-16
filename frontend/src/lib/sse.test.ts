import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseBlock, streamAsk, type AgentEvent } from './sse'

describe('parseBlock', () => {
  it('đọc một khối hợp lệ, kể cả tiếng Việt', () => {
    expect(parseBlock('event: token\ndata: {"step":1,"text":"Xin chào"}')).toEqual({
      type: 'token',
      data: { step: 1, text: 'Xin chào' },
    })
  })

  it('bỏ qua khối lạ, thiếu data hoặc JSON hỏng thay vì làm sập cả luồng', () => {
    expect(parseBlock('event: la\ndata: {}')).toBeNull()
    expect(parseBlock('event: token')).toBeNull()
    expect(parseBlock('event: token\ndata: {hỏng')).toBeNull()
    expect(parseBlock(': ping')).toBeNull()
  })
})

function streamFrom(chunks: string[]): Response {
  const enc = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

async function collect(chunks: string[]): Promise<AgentEvent[]> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamFrom(chunks)))
  const events: AgentEvent[] = []
  await streamAsk(1, { question: 'x', history: [] }, (e) => events.push(e), new AbortController().signal)
  return events
}

afterEach(() => vi.unstubAllGlobals())

describe('streamAsk', () => {
  it('ghép lại khối bị cắt đôi giữa hai lần đọc', async () => {
    const events = await collect([
      'event: token\ndata: {"step":1,"te',
      'xt":"a"}\n\nevent: token\nda',
      'ta: {"step":1,"text":"b"}\n\nevent: done\ndata: {}\n\n',
    ])
    expect(events.map((e) => e.type)).toEqual(['token', 'token', 'done'])
  })

  it('không vỡ chữ khi một ký tự tiếng Việt bị cắt giữa hai gói byte', async () => {
    const bytes = new TextEncoder().encode('event: token\ndata: {"step":1,"text":"ệ"}\n\n')
    const cut = bytes.indexOf(0xe1) + 1 // cắt giữa 3 byte của "ệ"
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)))
    const events: AgentEvent[] = []
    await streamAsk(1, { question: 'x', history: [] }, (e) => events.push(e), new AbortController().signal)
    expect(events).toEqual([{ type: 'token', data: { step: 1, text: 'ệ' } }])
  })

  it('chịu được xuống dòng kiểu Windows', async () => {
    const events = await collect(['event: done\r\ndata: {}\r\n\r\n'])
    expect(events.map((e) => e.type)).toEqual(['done'])
  })

  it('báo lỗi dễ hiểu khi server trả lỗi HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Chưa có repo này.' }), { status: 404 })),
    )
    await expect(
      streamAsk(1, { question: 'x', history: [] }, () => {}, new AbortController().signal),
    ).rejects.toThrow('Chưa có repo này.')
  })

  it('mất mạng thì báo lỗi thân thiện, còn bị chủ động huỷ thì im lặng', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(
      streamAsk(1, { question: 'x', history: [] }, () => {}, new AbortController().signal),
    ).rejects.toThrow('Không kết nối được')

    const ctrl = new AbortController()
    ctrl.abort()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError')))
    await expect(streamAsk(1, { question: 'x', history: [] }, () => {}, ctrl.signal)).resolves.toBeUndefined()
  })
})
