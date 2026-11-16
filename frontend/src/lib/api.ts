/** Gọi backend. Mọi thứ về hình dạng dữ liệu trả về nằm ở file này. */

export const API_BASE: string = import.meta.env.VITE_API_URL ?? ''

export type Repo = {
  id: number
  owner: string
  name: string
  indexed_at: string
  file_count: number
  chunk_count: number
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

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** FastAPI trả `detail` là chuỗi (lỗi mình tự ném) hoặc mảng (lỗi kiểm tra dữ liệu). */
function readDetail(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (status === 422) return 'Dữ liệu gửi lên không hợp lệ.'
  return 'Có lỗi xảy ra, thử lại sau nhé.'
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (e) {
    // bị chủ động hủy (đổi trang giữa chừng) thì không phải lỗi mạng
    if (init?.signal?.aborted) throw e
    throw new ApiError(0, 'Không kết nối được tới server. Kiểm tra mạng rồi thử lại nhé.')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, readDetail(body, res.status))
  }
  return res.json() as Promise<T>
}

export const api = {
  addRepo: (url: string, signal?: AbortSignal) =>
    request<IndexResult>('/api/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    }),
  getRepo: (id: number) => request<Repo>(`/api/repos/${id}`),
  listFiles: (id: number) => request<FileInfo[]>(`/api/repos/${id}/files`),
  readFile: (id: number, path: string, start = 1, end?: number) => {
    const q = new URLSearchParams({ path, start: String(start) })
    if (end) q.set('end', String(end))
    return request<FileSlice>(`/api/repos/${id}/file?${q}`)
  },
}
