import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import styles from './CodeViewer.module.css'

/** `highlight`: true khi mở từ một trích dẫn (tô sáng khoảng dòng), false khi mở từ cây file. */
export type CodeTarget = { path: string; start: number; end: number; highlight: boolean }

const WINDOW = 400 // số dòng tải mỗi lần
const BEFORE = 30 // mở từ trích dẫn thì cho xem thêm chừng này dòng phía trước
const AFTER = 60

type Loaded = { first: number; lines: string[]; total: number }

function githubUrl(owner: string, name: string, t: CodeTarget): string {
  const plain = t.path.toLowerCase().endsWith('.md') ? '?plain=1' : ''
  const anchor = t.start === t.end ? `#L${t.start}` : `#L${t.start}-L${t.end}`
  return `https://github.com/${owner}/${name}/blob/HEAD/${t.path.split('/').map(encodeURIComponent).join('/')}${plain}${anchor}`
}

export default function CodeViewer({
  repoId,
  owner,
  name,
  target,
  onBack,
}: {
  repoId: number
  owner: string
  name: string
  target: CodeTarget | null
  onBack: () => void
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [more, setMore] = useState<'before' | 'after' | null>(null)
  const firstHit = useRef<HTMLDivElement>(null)
  const scrolledFor = useRef<string>('')

  const key = target ? `${target.path}:${target.start}-${target.end}:${target.highlight}` : ''

  // Nạp một khoảng quanh dòng được trích dẫn (hoặc từ đầu file nếu mở từ cây file).
  useEffect(() => {
    if (!target) return
    let cancelled = false
    const start = target.highlight ? Math.max(1, target.start - BEFORE) : 1
    const end = target.highlight ? target.end + AFTER : WINDOW

    api
      .readFile(repoId, target.path, start, end)
      .then((s) => {
        if (cancelled) return
        setError(null)
        setLoaded({ first: s.start_line, lines: s.lines, total: s.line_count })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoaded(null)
        setError(e instanceof ApiError ? e.message : 'Could not load this file.')
      })
    return () => {
      cancelled = true
    }
  }, [repoId, target])

  // Cuộn tới đoạn được trích dẫn đúng một lần cho mỗi lần mở.
  useEffect(() => {
    if (loaded && firstHit.current && scrolledFor.current !== key) {
      scrolledFor.current = key
      firstHit.current.scrollIntoView({ block: 'center' })
    }
  }, [loaded, key])

  const loadMore = useCallback(
    async (dir: 'before' | 'after') => {
      if (!target || !loaded) return
      setMore(dir)
      try {
        if (dir === 'after') {
          const s = await api.readFile(repoId, target.path, loaded.first + loaded.lines.length, loaded.first + loaded.lines.length + WINDOW - 1)
          setLoaded((p) => (p ? { ...p, lines: [...p.lines, ...s.lines] } : p))
        } else {
          const start = Math.max(1, loaded.first - WINDOW)
          const s = await api.readFile(repoId, target.path, start, loaded.first - 1)
          setLoaded((p) => (p ? { ...p, first: start, lines: [...s.lines, ...p.lines] } : p))
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load more lines.')
      } finally {
        setMore(null)
      }
    },
    [repoId, target, loaded],
  )

  if (!target) {
    return (
      <div className={styles.viewer}>
        <div className={styles.head}>
          <button type="button" className={styles.back} onClick={onBack}>
            ← Chat
          </button>
        </div>
        <div className={styles.empty}>
          <p>Pick a file, or click a citation in an answer, to read the code here.</p>
        </div>
      </div>
    )
  }

  const dir = target.path.includes('/') ? target.path.slice(0, target.path.lastIndexOf('/') + 1) : ''
  const file = target.path.slice(dir.length)
  const hasCitation = target.highlight
  const width = String((loaded ? loaded.first + loaded.lines.length : 0) || 1).length

  return (
    <div className={styles.viewer}>
      <div className={styles.head}>
        <button type="button" className={styles.back} onClick={onBack}>
          ← Chat
        </button>
        <span className={styles.path} title={target.path}>
          {dir}
          <b>{file}</b>
        </span>
        <a className={styles.gh} href={githubUrl(owner, name, target)} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!loaded && !error && <p className={styles.loading}>Loading…</p>}

      {loaded && (
        <div className={styles.code} role="region" aria-label={`Source of ${target.path}`} tabIndex={0}>
          {loaded.first > 1 && (
            <button type="button" className={styles.more} onClick={() => loadMore('before')} disabled={more !== null}>
              {more === 'before' ? 'Loading…' : `Show earlier lines (1-${loaded.first - 1})`}
            </button>
          )}
          {loaded.lines.map((text, i) => {
            const n = loaded.first + i
            const hit = hasCitation && n >= target.start && n <= target.end
            return (
              <div
                key={n}
                ref={hit && n === target.start ? firstHit : undefined}
                className={`${styles.line} ${hit ? styles.hit : ''}`}
              >
                <span className={styles.num} style={{ width: `${width + 2}ch` }}>
                  {n}
                </span>
                <span className={styles.text}>{text || ' '}</span>
              </div>
            )
          })}
          {loaded.first + loaded.lines.length <= loaded.total && (
            <button type="button" className={styles.more} onClick={() => loadMore('after')} disabled={more !== null}>
              {more === 'after'
                ? 'Loading…'
                : `Show more lines (${loaded.first + loaded.lines.length}-${loaded.total})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
