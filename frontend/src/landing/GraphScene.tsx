import { useEffect, useRef, useState } from 'react'
import FallbackGraph from './FallbackGraph'
import styles from './GraphScene.module.css'

const LABEL = "Code files drawn as a graph, with the agent's path highlighted"

type Status = 'loading' | 'ready' | 'fallback'

export default function GraphScene() {
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
            ariaLabel: LABEL,
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

  const ready = status === 'ready'
  return (
    <div className={styles.frame}>
      <FallbackGraph className={`${styles.fallback} ${ready ? styles.hidden : ''}`} hidden={ready} label={LABEL} />
      <div ref={hostRef} className={styles.host} />
      <span className={styles.badge}>{ready && !reduced ? 'live: agent walking the repo' : 'agent path: search, read, cite'}</span>
    </div>
  )
}
