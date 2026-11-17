/** Gọi backend. Mọi thứ về hình dạng dữ liệu trả về nằm ở file này. */

import { getLang, translate } from '../i18n'
import type { Citation, Usage } from './sse'
import { getToken } from './token'

export const API_BASE: string = import.meta.env.VITE_API_URL ?? ''

export type Repo = {
  id: number
  owner: string
  name: string
  indexed_at: string
  file_count: number
  chunk_count: number
  /** true khi vector đã tạo xong và tìm theo nghĩa đang bật */
  semantic?: boolean
}

export type IndexResult = Pick<Repo, 'id' | 'owner' | 'name' | 'file_count' | 'chunk_count'> & {
  skipped: number
}

export type FileInfo = { path: string; language: string; line_count: number }

export type FileSlice = {
  path: string
  language: string
  line_count: number
  start_line: number
  end_line: number
  lines: string[]
}

export type User = { id: string; email: string; name: string; picture: string }

export type ConversationSummary = {
  id: string
  owner: string
  name: string
  title: string
  created_at: string
  updated_at: string
  turn_count?: number
}

/** Một lượt hỏi đáp như server lưu (khớp với Turn ở giao diện, trừ `id`). */
export type SavedTurn = {
  question: string
  status: 'done' | 'error' | 'stopped'
  notes?: string[]
  steps?: { id: string; name: string; args: Record<string, unknown>; status: 'running' | 'done'; ms?: number; chars?: number; preview?: string }[]
  answer?: string
  citations?: Citation[]
  usage?: Usage | null
  error?: string | null
}

export type Conversation = ConversationSummary & { turns: SavedTurn[] }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Gọi khi server từ chối token (hết hạn hoặc bị thu hồi). authStore đăng ký hàm này để đăng xuất. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

/** Header báo cho server biết người dùng đang dùng ngôn ngữ nào, để thông báo lỗi đúng tiếng. */
export function langHeaders(): Record<string, string> {
  return { 'X-Lang': getLang() }
}

/** Thêm Authorization nếu đang đăng nhập. */
export function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** FastAPI trả `detail` là chuỗi (lỗi mình tự ném, đã đúng ngôn ngữ) hoặc mảng (lỗi kiểm tra dữ liệu). */
function readDetail(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  return translate(getLang(), status === 422 ? 'error.validation' : 'error.generic')
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Server miễn phí ngủ sau một lúc không dùng và mất cả chục giây để dậy, trong lúc đó request
// báo lỗi mạng hoặc 502/503/504. Các lệnh chỉ đọc (GET) an toàn để thử lại vài lần.
const RETRY_DELAYS = [800, 2500, 6000]
const TRANSIENT = new Set([0, 502, 503, 504])

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET'
  const retries = method === 'GET' ? RETRY_DELAYS.length : 0
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: { ...langHeaders(), ...authHeaders(), ...init.headers },
      })
    } catch (e) {
      // bị chủ động hủy (đổi trang giữa chừng) thì không phải lỗi mạng
      if (init.signal?.aborted) throw e
    }

    if (res?.ok) return res.json() as Promise<T>

    const status = res?.status ?? 0
    if (TRANSIENT.has(status) && attempt < retries) {
      await sleep(RETRY_DELAYS[attempt])
      continue
    }
    if (!res) throw new ApiError(0, translate(getLang(), 'error.network'))
    if (status === 401 && getToken()) onUnauthorized?.()
    const body = await res.json().catch(() => null)
    throw new ApiError(status, readDetail(body, status))
  }
}

async function requestVoid(path: string, init: RequestInit): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...langHeaders(), ...authHeaders(), ...init.headers },
  }).catch(() => {
    throw new ApiError(0, translate(getLang(), 'error.network'))
  })
  if (!res.ok) {
    if (res.status === 401 && getToken()) onUnauthorized?.()
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, readDetail(body, res.status))
  }
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  addRepo: (url: string, signal?: AbortSignal) => request<IndexResult>('/api/repos', { ...json({ url }), signal }),
  getRepo: (id: number) => request<Repo>(`/api/repos/${id}`),
  findRepo: (owner: string, name: string) =>
    request<Repo>(`/api/repos/by-name/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`),
  listFiles: (id: number) => request<FileInfo[]>(`/api/repos/${id}/files`),
  readFile: (id: number, path: string, start = 1, end?: number) => {
    const q = new URLSearchParams({ path, start: String(start) })
    if (end) q.set('end', String(end))
    return request<FileSlice>(`/api/repos/${id}/file?${q}`)
  },

  authConfig: () => request<{ enabled: boolean; google_client_id: string }>('/api/auth/config'),
  loginGoogle: (credential: string) =>
    request<{ token: string; user: User }>('/api/auth/google', json({ credential })),
  me: () => request<User>('/api/me'),
  deleteMe: () => requestVoid('/api/me', { method: 'DELETE' }),

  createConversation: (repo: string) => request<ConversationSummary>('/api/conversations', json({ repo })),
  listConversations: () => request<ConversationSummary[]>('/api/conversations'),
  getConversation: (id: string) => request<Conversation>(`/api/conversations/${encodeURIComponent(id)}`),
  deleteConversation: (id: string) =>
    requestVoid(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
