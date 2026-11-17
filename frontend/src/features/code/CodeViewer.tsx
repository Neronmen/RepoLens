import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { api, ApiError } from '../../lib/api'
import { fileBadge } from '../files/fileIcon'
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
  const { t } = useI18n()
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
        setError(e instanceof ApiError ? e.message : t('code.loadFail'))
      })
    return () => {
      cancelled = true
    }
  }, [repoId, target, t])

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
          const from = loaded.first + loaded.lines.length
          const s = await api.readFile(repoId, target.path, from, from + WINDOW - 1)
          setLoaded((p) => (p ? { ...p, lines: [...p.lines, ...s.lines] } : p))
        } else {
          const start = Math.max(1, loaded.first - WINDOW)
          const s = await api.readFile(repoId, target.path, start, loaded.first - 1)
          setLoaded((p) => (p ? { ...p, first: start, lines: [...s.lines, ...p.lines] } : p))
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : t('code.moreFail'))
      } finally {
        setMore(null)
      }
    },
    [repoId, target, loaded, t],
  )

  if (!target) {
    return (
      <div className={styles.viewer}>
        <div className={styles.tabs}>
          <button type="button" className={styles.back} onClick={onBack}>
            {t('code.back')}
          </button>
        </div>
        <div className={styles.empty}>
          <p>{t('code.empty')}</p>
        </div>
      </div>
    )
  }

  const parts = target.path.split('/')
  const file = parts[parts.length - 1]
  const badge = fileBadge(file)
  const hasCitation = target.highlight
  const width = String((loaded ? loaded.first + loaded.lines.length : 0) || 1).length

  return (
    <div className={styles.viewer}>
      {/* thanh tab giống VS Code: huy hiệu loại file và tên file đang mở */}
      <div className={styles.tabs}>
        <button type="button" className={styles.back} onClick={onBack}>
          {t('code.back')}
        </button>
        <div className={styles.tab}>
          <span className={styles.badge} style={{ background: badge.bg, color: badge.fg }} aria-hidden="true">
            {badge.label}
          </span>
          <span className={styles.tabName}>{file}</span>
        </div>
      </div>

      <div className={styles.crumbs}>
        <span className={styles.path} title={target.path}>
          {parts.slice(0, -1).map((p, i) => (
            <span key={i}>
              {p} <span className={styles.sep}>›</span>{' '}
            </span>
          ))}
          <b>{file}</b>
        </span>
        <a className={styles.gh} href={githubUrl(owner, name, target)} target="_blank" rel="noreferrer">
          {t('code.github')}
        </a>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!loaded && !error && <p className={styles.loading}>{t('code.loading')}</p>}

      {loaded && (
        <div className={styles.code} role="region" aria-label={t('code.region', { path: target.path })} tabIndex={0}>
          {loaded.first > 1 && (
            <button type="button" className={styles.more} onClick={() => loadMore('before')} disabled={more !== null}>
              {more === 'before' ? t('code.loading') : t('code.earlier', { n: loaded.first - 1 })}
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
                ? t('code.loading')
                : t('code.more', { from: loaded.first + loaded.lines.length, to: loaded.total })}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
