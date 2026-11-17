import { useSyncExternalStore } from 'react'

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

/** Trình duyệt có đang online không (theo sự kiện online/offline). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

/** Chờ tới khi có mạng lại (hoặc hết `maxMs`), để thử lại đúng lúc thay vì đập vào mạng đang đứt. */
export function waitForOnline(signal: AbortSignal, maxMs = 30_000): Promise<void> {
  if (navigator.onLine) return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener('online', done)
      signal.removeEventListener('abort', done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, maxMs)
    window.addEventListener('online', done)
    signal.addEventListener('abort', done)
  })
}
