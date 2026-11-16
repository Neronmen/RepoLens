/** Trạng thái của cuộc hội thoại: mỗi câu hỏi là một "lượt" (turn).
 *
 * Tách thành một hàm reducer thuần để test được mà không cần dựng giao diện:
 * các sự kiện SSE đi vào, danh sách lượt đi ra.
 */
import type { AgentEvent, Citation, HistoryItem, Usage } from '../../lib/sse'

export type Step = {
  id: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'done'
  ms?: number
  chars?: number
  preview?: string
}

export type Turn = {
  id: number
  question: string
  status: 'streaming' | 'done' | 'error' | 'stopped'
  notes: string[] // vài chữ model viết trước khi gọi công cụ ("để mình tìm thử...")
  steps: Step[]
  answer: string
  citations: Citation[]
  usage: Usage | null
  error: string | null
}

export type Action =
  | { type: 'ask'; id: number; question: string }
  | { type: 'event'; id: number; event: AgentEvent }
  | { type: 'fail'; id: number; message: string }
  | { type: 'stop'; id: number }

export function newTurn(id: number, question: string): Turn {
  return { id, question, status: 'streaming', notes: [], steps: [], answer: '', citations: [], usage: null, error: null }
}

function applyEvent(t: Turn, ev: AgentEvent): Turn {
  switch (ev.type) {
    case 'token':
      return { ...t, answer: t.answer + ev.data.text }
    case 'preamble':
      // Những chữ vừa stream hoá ra chỉ là lời dẫn, chưa phải câu trả lời.
      return { ...t, notes: [...t.notes, ev.data.text.trim()].filter(Boolean), answer: '' }
    case 'tool_call':
      return {
        ...t,
        steps: [...t.steps, { id: ev.data.id, name: ev.data.name, args: ev.data.args, status: 'running' }],
      }
    case 'tool_result':
      return {
        ...t,
        steps: t.steps.map((s) =>
          s.id === ev.data.id
            ? { ...s, status: 'done', ms: ev.data.ms, chars: ev.data.chars, preview: ev.data.preview }
            : s,
        ),
      }
    case 'citations':
      return { ...t, citations: ev.data.items }
    case 'usage':
      return { ...t, usage: ev.data }
    case 'error':
      return { ...t, status: 'error', error: ev.data.message }
    case 'done':
      // `error` đã đặt trạng thái riêng, đừng ghi đè nó bằng "xong"
      return t.status === 'streaming' ? { ...t, status: 'done' } : t
  }
}

export function turnsReducer(turns: Turn[], action: Action): Turn[] {
  if (action.type === 'ask') return [...turns, newTurn(action.id, action.question)]

  return turns.map((t) => {
    if (t.id !== action.id) return t
    switch (action.type) {
      case 'event':
        return applyEvent(t, action.event)
      case 'fail':
        return { ...t, status: 'error', error: action.message }
      case 'stop':
        return t.status === 'streaming' ? { ...t, status: 'stopped' } : t
    }
  })
}

/** Lịch sử gửi kèm câu hỏi mới để hỏi nối tiếp được. Chỉ lấy các lượt đã có câu trả lời. */
export function buildHistory(turns: Turn[], maxTurns = 4): HistoryItem[] {
  return turns
    .filter((t) => t.status === 'done' && t.answer.trim())
    .slice(-maxTurns)
    .flatMap<HistoryItem>((t) => [
      { role: 'user', content: t.question },
      { role: 'assistant', content: t.answer },
    ])
}
