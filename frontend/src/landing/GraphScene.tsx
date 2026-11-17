import { useEffect, useRef, useState } from 'react'
import FallbackGraph from './FallbackGraph'
import { useI18n } from '../i18n'
import styles from './GraphScene.module.css'

type Status = 'loading' | 'ready' | 'fallback'

export default function GraphScene() {
  const { t } = useI18n()
  const label = t('landing.scene.label')
  const labelRef = useRef(label)
  labelRef.current = label
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let dispose: (() => void) | undefined

    // Đợi trang vẽ xong chữ rồi mới tải ~600KB của three, để hero hiện ngay.
    const timer = window.setTimeout(() => {
      import('./graph')
        .then(({ createGraphScene }) => {
          if (disposed) return
          dispose = createGraphScene(host, {
            reduceMotion: reduced,
            ariaLabel: labelRef.current,
            labelClass: styles.label,
            onFail: () => setStatus('fallback'),
          })
          setStatus('ready')
        })
        .catch(() => {
          // Không có WebGL hoặc chunk tải lỗi: giữ hình SVG tĩnh, không để trang trắng.
          if (!disposed) setStatus('fallback')
        })
    }, 120)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      dispose?.()
    }
  }, [reduced])

  // Đổi ngôn ngữ chỉ cập nhật nhãn của canvas, không dựng lại cảnh 3D.
  useEffect(() => {
    hostRef.current?.querySelector('canvas')?.setAttribute('aria-label', label)
  }, [label, status])

  const ready = status === 'ready'
  return (
    <div className={styles.frame}>
      <FallbackGraph className={`${styles.fallback} ${ready ? styles.hidden : ''}`} hidden={ready} label={label} />
      <div ref={hostRef} className={styles.host} />
      <span className={styles.badge}>{ready && !reduced ? t('landing.scene.badgeLive') : t('landing.scene.badgeStatic')}</span>
    </div>
  )
}
