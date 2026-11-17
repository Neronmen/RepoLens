import { useSyncExternalStore } from 'react'
import { api, ApiError, setUnauthorizedHandler, type User } from '../../lib/api'
import { getToken, setToken } from '../../lib/token'

/** 'unknown' = có token nhưng chưa hỏi server xem còn dùng được không. */
export type AuthStatus = 'unknown' | 'out' | 'in'
type Snapshot = { status: AuthStatus; user: User | null }

let snap: Snapshot = { status: getToken() ? 'unknown' : 'out', user: null }
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
  set({ status: 'out', user: null })
}

// token hết hạn giữa chừng thì đăng xuất êm thay vì để từng chỗ tự báo lỗi
setUnauthorizedHandler(signOut)

let booting: Promise<void> | null = null

/** Kiểm tra token đã lưu còn dùng được không. Gọi một lần khi mở app. */
export function bootAuth(): Promise<void> {
  if (!getToken()) return Promise.resolve()
  booting ??= api
    .me()
    .then((user) => set({ status: 'in', user }))
    .catch((e: unknown) => {
      // 401 đã tự đăng xuất ở api.ts. Lỗi mạng thì giữ token, lần sau thử lại.
      if (!(e instanceof ApiError) || e.status !== 401) set({ status: 'unknown', user: null })
    })
    .finally(() => {
      booting = null
    })
  return booting
}

export async function signInWithGoogle(credential: string) {
  const { token, user } = await api.loginGoogle(credential)
  setToken(token)
  set({ status: 'in', user })
}

export async function deleteAccount() {
  await api.deleteMe()
  signOut()
}
