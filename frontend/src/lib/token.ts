/** Chỗ giữ token phiên đăng nhập. Tách riêng để api.ts đọc được mà không phải import ngược từ store. */

const KEY = 'repolens.token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null // chế độ riêng tư hoặc bị chặn lưu trữ: coi như chưa đăng nhập
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(KEY, token)
    else localStorage.removeItem(KEY)
  } catch {
    // không lưu được thì phiên chỉ sống đến khi tải lại trang, chấp nhận được
  }
}
