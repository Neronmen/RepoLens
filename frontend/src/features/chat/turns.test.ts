import { describe, expect, it } from 'vitest'
import type { AgentEvent } from '../../lib/sse'
import { buildHistory, turnsReducer, type Action, type Turn } from './turns'

const ev = (event: AgentEvent): Action => ({ type: 'event', id: 1, event })

function run(...actions: Action[]): Turn[] {
  return actions.reduce(turnsReducer, [] as Turn[])
}

const ask = (question = 'hỏi gì đó'): Action => ({ type: 'ask', id: 1, question })

describe('turnsReducer', () => {
  it('ghép các token thành câu trả lời', () => {
    const [t] = run(
      ask(),
      ev({ type: 'token', data: { step: 2, text: 'Xin ' } }),
      ev({ type: 'token', data: { step: 2, text: 'chào' } }),
    )
    expect(t.answer).toBe('Xin chào')
    expect(t.status).toBe('streaming')
  })

  it('lời dẫn trước khi gọi công cụ không lẫn vào câu trả lời', () => {
    const [t] = run(
      ask(),
      ev({ type: 'token', data: { step: 1, text: 'Để mình tìm thử. ' } }),
      ev({ type: 'preamble', data: { step: 1, text: 'Để mình tìm thử. ' } }),
      ev({ type: 'token', data: { step: 2, text: 'Đây là kết quả.' } }),
    )
    expect(t.notes).toEqual(['Để mình tìm thử.'])
    expect(t.answer).toBe('Đây là kết quả.')
  })

  it('công cụ chạy xong thì cập nhật đúng bước theo id', () => {
    const [t] = run(
      ask(),
      ev({ type: 'tool_call', data: { step: 1, id: 'a', name: 'grep', args: { text: 'x' } } }),
      ev({ type: 'tool_call', data: { step: 1, id: 'b', name: 'read_file', args: {} } }),
      ev({ type: 'tool_result', data: { step: 1, id: 'b', ms: 1.5, chars: 200, preview: '...' } }),
    )
    expect(t.steps.map((s) => [s.id, s.status])).toEqual([
      ['a', 'running'],
      ['b', 'done'],
    ])
    expect(t.steps[1].ms).toBe(1.5)
  })

  it('kết thúc bình thường', () => {
    const [t] = run(ask(), ev({ type: 'done', data: {} }))
    expect(t.status).toBe('done')
  })

  it('lỗi từ server không bị "done" ghi đè thành thành công', () => {
    const [t] = run(
      ask(),
      ev({ type: 'error', data: { message: 'Model đang bận' } }),
      ev({ type: 'done', data: {} }),
    )
    expect(t.status).toBe('error')
    expect(t.error).toBe('Model đang bận')
  })

  it('bấm dừng chỉ đổi lượt đang chạy, không đụng lượt đã xong', () => {
    const turns = run(
      ask(),
      ev({ type: 'done', data: {} }),
      { type: 'stop', id: 1 },
    )
    expect(turns[0].status).toBe('done')
    expect(run(ask(), { type: 'stop', id: 1 })[0].status).toBe('stopped')
  })

  it('chỉ lượt có id tương ứng bị đổi', () => {
    const turns = run(
      ask('một'),
      { type: 'ask', id: 2, question: 'hai' },
      { type: 'event', id: 2, event: { type: 'token', data: { step: 1, text: 'x' } } },
    )
    expect(turns.map((t) => t.answer)).toEqual(['', 'x'])
  })

  it('mất kết nối giữa chừng thì báo lỗi nhưng giữ phần đã nhận', () => {
    const [t] = run(
      ask(),
      ev({ type: 'token', data: { step: 1, text: 'một nửa' } }),
      { type: 'fail', id: 1, message: 'Kết nối bị ngắt' },
    )
    expect(t.status).toBe('error')
    expect(t.answer).toBe('một nửa')
  })
})

describe('buildHistory', () => {
  const done = (id: number, q: string, a: string): Turn => ({
    id, question: q, answer: a, status: 'done', notes: [], steps: [], citations: [], usage: null, error: null,
  })

  it('chỉ lấy các lượt đã xong và có câu trả lời', () => {
    const turns: Turn[] = [
      done(1, 'q1', 'a1'),
      { ...done(2, 'q2', ''), status: 'error' },
      { ...done(3, 'q3', 'a3'), status: 'stopped' },
      done(4, 'q4', '   '),
    ]
    expect(buildHistory(turns)).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
    ])
  })

  it('giữ các lượt gần nhất khi quá dài', () => {
    const turns = [1, 2, 3, 4, 5, 6].map((i) => done(i, `q${i}`, `a${i}`))
    const h = buildHistory(turns, 2)
    expect(h.map((x) => x.content)).toEqual(['q5', 'a5', 'q6', 'a6'])
  })
})
