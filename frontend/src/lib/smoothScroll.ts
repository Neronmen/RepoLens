/** Cuộn mượt tới một phần tử trong trang, có easing và tự dừng khi người dùng tự cuộn. */

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

let cancel: (() => void) | null = null

export function smoothScrollTo(target: HTMLElement, offset = 0): void {
  cancel?.()
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const maxY = document.documentElement.scrollHeight - window.innerHeight
  const startY = window.scrollY
  const endY = Math.max(0, Math.min(maxY, target.getBoundingClientRect().top + startY - offset))
  const distance = endY - startY

  const finish = () => {
    // chuyển tiêu điểm tới phần được cuộn đến để bàn phím và trình đọc màn hình đi tiếp từ đó
    target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  }
  if (reduced || Math.abs(distance) < 2) {
    window.scrollTo(0, endY)
    finish()
    return
  }

  // đi xa thì lâu hơn một chút, nhưng luôn nằm trong khoảng dễ chịu
  const duration = Math.min(1100, Math.max(550, Math.abs(distance) * 0.55))
  const t0 = performance.now()
  let raf = 0
  const stop = () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('wheel', stop)
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('keydown', stop)
    cancel = null
  }
  cancel = stop
  // người dùng tự cuộn thì nhường quyền lại ngay, không giằng co
  window.addEventListener('wheel', stop, { passive: true })
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('keydown', stop)

  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration)
    window.scrollTo(0, startY + distance * easeInOutCubic(p))
    if (p < 1) {
      raf = requestAnimationFrame(step)
    } else {
      stop()
      finish()
    }
  }
  raf = requestAnimationFrame(step)
}

type ClickLike = { preventDefault(): void; button?: number; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }

/** Dùng cho onClick của thẻ <a href="#id">: cuộn mượt thay vì nhảy thẳng, và cập nhật địa chỉ. */
export function onAnchorClick(e: ClickLike, id: string, offset = 0) {
  // để nguyên hành vi của chuột giữa, Ctrl/Cmd+click (mở tab mới)...
  if (e.button || e.metaKey || e.ctrlKey || e.shiftKey) return
  const el = document.getElementById(id)
  if (!el) return
  e.preventDefault()
  history.replaceState(null, '', `#${id}`)
  smoothScrollTo(el, offset)
}
