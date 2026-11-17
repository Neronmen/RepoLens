import { useSyncExternalStore } from 'react'
import { api, ApiError, setUnauthorizedHandler, type User } from '../../lib/api'
import { getToken, setToken } from '../../lib/token'

/** 'unknown' = có token nhưng chưa hỏi server xem còn dùng được không. */
export type AuthStatus = 'unknown' | 'out' | 'in'
type Snapshot = { status: AuthStatus; user: User | null }

const USER_KEY = 'repolens.user'

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function saveUser(u: User | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u))
    else localStorage.removeItem(USER_KEY)
  } catch {
    // không lưu được thì lần sau chờ server trả lời mới có ảnh
  }
}

// Có token thì hiện ngay ảnh đã nhớ từ lần trước, server xác nhận sau. Khỏi nhấp nháy hay trống không.
const hasToken = !!getToken()
let snap: Snapshot = { status: hasToken ? 'unknown' : 'out', user: hasToken ? loadUser() : null }
const listeners = new Set<() => void>()

function set(next: Snapshot) {
  snap = next
  listeners.forEach((l) => l())
}

export function useAuth(): Snapshot {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snap,
  )
}

export function signOut() {
  setToken(null)
  saveUser(null)
  set({ status: 'out', user: null })
}

// token hết hạn giữa chừng thì đăng xuất êm thay vì để từng chỗ tự báo lỗi
setUnauthorizedHandler(signOut)

let booting: Promise<void> | null = null

/** Kiểm tra token đã lưu còn dùng được không. Gọi một lần khi mở app. */
const RETRY_MS = [2000, 4000, 8000, 15000, 30000]

export function bootAuth(): Promise<void> {
  if (!getToken()) return Promise.resolve()
  booting ??= (async () => {
    for (let i = 0; getToken(); i++) {
      try {
        const user = await api.me()
        saveUser(user)
        set({ status: 'in', user })
        return
      } catch (e) {
        // 401 đã tự đăng xuất ở api.ts. Lỗi mạng hay server đang ngủ thì giữ token và thử lại,
        // trước đây bỏ cuộc ở đây nên ảnh đại diện đứng im ở vòng tròn xám.
        if (e instanceof ApiError && e.status === 401) return
        await new Promise((r) => setTimeout(r, RETRY_MS[Math.min(i, RETRY_MS.length - 1)]))
      }
    }
  })().finally(() => {
    booting = null
  })
  return booting
}

export async function signInWithGoogle(credential: string) {
  const { token, user } = await api.loginGoogle(credential)
  setToken(token)
  saveUser(user)
  set({ status: 'in', user })
}

export async function deleteAccount() {
  await api.deleteMe()
  signOut()
}
