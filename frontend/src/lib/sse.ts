/** Đọc luồng SSE từ POST /api/repos/{id}/ask.
 *
 * Không dùng `EventSource` có sẵn của trình duyệt vì nó chỉ gửi được GET,
 * còn mình cần gửi câu hỏi và lịch sử trong body của POST.
 */
import { getLang, translate } from '../i18n'
import { API_BASE, ApiError, authHeaders, langHeaders } from './api'

export type Citation = {
  path: string
  start_line: number
  end_line: number
  valid: boolean // file và khoảng dòng có thật
  seen: boolean // agent đã thật sự đọc file này
  url: string | null
}

export type Usage = {
  input_tokens: number
  output_tokens: number
  steps: number
  tool_calls: number
  ms: number
}

export type AgentEvent =
  | { type: 'token'; data: { step: number; text: string } }
  | { type: 'preamble'; data: { step: number; text: string } }
  | { type: 'tool_call'; data: { step: number; id: string; name: string; args: Record<string, unknown> } }
  | { type: 'tool_result'; data: { step: number; id: string; ms: number; chars: number; preview: string } }
  | { type: 'citations'; data: { items: Citation[] } }
  | { type: 'usage'; data: Usage }
  | { type: 'error'; data: { message: string } }
  | { type: 'done'; data: Record<string, never> }

export type HistoryItem = { role: 'user' | 'assistant'; content: string }

const KNOWN = new Set(['token', 'preamble', 'tool_call', 'tool_result', 'citations', 'usage', 'error', 'done'])

/** Tách một khối SSE ("event: x\ndata: {...}") thành sự kiện. Khối lạ hoặc hỏng thì bỏ qua. */
export function parseBlock(block: string): AgentEvent | null {
  let type = ''
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
  }
  if (!KNOWN.has(type) || dataLines.length === 0) return null
  try {
    return { type, data: JSON.parse(dataLines.join('\n')) } as AgentEvent
  } catch {
    return null
  }
}

export async function streamAsk(
  repoId: number,
  body: { question: string; history: HistoryItem[]; conversation_id?: string },
  onEvent: (ev: AgentEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/api/repos/${repoId}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...langHeaders(), ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal.aborted) return
    throw new ApiError(0, translate(getLang(), 'error.network'))
  }

  if (!res.ok || !res.body) {
    const detail = await res.json().then((b) => b?.detail).catch(() => null)
    throw new ApiError(res.status, typeof detail === 'string' ? detail : translate(getLang(), 'error.generic'))
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      // gom lại rồi mới tách, vì một khối có thể bị cắt đôi giữa hai lần đọc
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let cut: number
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const ev = parseBlock(buffer.slice(0, cut))
        buffer = buffer.slice(cut + 2)
        if (ev) onEvent(ev)
      }
    }
  } catch (e) {
    if (signal.aborted) return
    throw new ApiError(0, translate(getLang(), 'error.cut'))
  }
}
