import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { type RefObject, useLayoutEffect } from 'react'

gsap.registerPlugin(ScrollTrigger)

// Toàn bộ chuyển động của landing: hiệu ứng vào hero, hiện dần khi cuộn, và "gõ" dòng trace.
// Nội dung mặc định luôn hiển thị trong CSS; trạng thái ẩn ban đầu do gsap.from đặt từ JS,
// nên nếu JS lỗi hay người dùng bật "giảm chuyển động" thì chữ vẫn đọc được.
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  // useLayoutEffect để trạng thái ban đầu được đặt trước khi trình duyệt vẽ: không bị nháy chữ.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    // gsap.context gom mọi tween/ScrollTrigger lại; revert() dọn sạch để StrictMode không nhân đôi.
    const ctx = gsap.context(() => {
      // Chỉ dịch chuyển/đổi độ mờ, không đụng tới focus hay pointer: người dùng gõ vào ô được ngay.
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-hero="eyebrow"]', { opacity: 0, y: 12, duration: 0.5 })
        .from('[data-hero="line"]', { yPercent: 110, duration: 0.7, stagger: 0.1 }, 0.05)
        .from('[data-hero="lead"]', { opacity: 0, y: 16, duration: 0.6 }, 0.4)
        .from('[data-hero="form"]', { opacity: 0, y: 16, duration: 0.6 }, 0.5)
        .from('[data-hero="chips"]', { opacity: 0, y: 10, duration: 0.5 }, 0.6)
        .from('[data-hero="visual"]', { opacity: 0, scale: 0.97, duration: 0.8 }, 0.2)

      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((target) => {
        gsap.from(target, {
          opacity: 0,
          y: 28,
          duration: 0.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: target, start: 'top 88%', once: true },
        })
      })

      gsap.utils.toArray<HTMLElement>('[data-stagger]').forEach((group) => {
        gsap.from(group.children, {
          opacity: 0,
          y: 24,
          duration: 0.7,
          stagger: 0.12,
          ease: 'power2.out',
          scrollTrigger: { trigger: group, start: 'top 85%', once: true },
        })
      })

      // Các dòng trace hiện ra như đang được gõ, từng dòng một.
      const term = el.querySelector<HTMLElement>('[data-term]')
      if (term) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: term, start: 'top 80%', once: true } })
        term.querySelectorAll<HTMLElement>('[data-term-line]').forEach((line) => {
          const chars = Math.max(8, (line.textContent ?? '').length)
          tl.fromTo(
            line,
            { clipPath: 'inset(0 100% 0 0)' },
            { clipPath: 'inset(0 0% 0 0)', duration: Math.max(0.35, chars * 0.014), ease: `steps(${chars})` },
            '>+0.12',
          )
        })
      }
    }, el)

    // Font tải xong làm dịch bố cục, nên tính lại vị trí kích hoạt khi cuộn.
    let cancelled = false
    void document.fonts?.ready.then(() => {
      if (!cancelled) ScrollTrigger.refresh()
    })

    return () => {
      cancelled = true
      ctx.revert()
    }
  }, [root])
}
