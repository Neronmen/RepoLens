import { useState } from 'react'
import { useI18n } from '../../i18n'
import type { Step, Turn } from './turns'
import styles from './TraceBlock.module.css'

/** Tóm tắt tham số của một công cụ thành một dòng ngắn dễ đọc. Đây là mã, nên giữ nguyên, không dịch. */
export function describeArgs(step: Pick<Step, 'name' | 'args'>): string {
  const a = step.args
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  switch (step.name) {
    case 'search_code':
      return `"${str(a.query)}"`
    case 'grep': {
      const where = str(a.path_prefix)
      return `"${str(a.text)}"${where ? ` in ${where}` : ''}`
    }
    case 'list_files':
      return str(a.path_prefix) || '/'
    case 'read_file': {
      const start = a.start_line
      const end = a.end_line
      const range = start || end ? ` ${start ?? 1}-${end ?? ''}` : ''
      return `${str(a.path)}${range}`
    }
    default:
      return ''
  }
}

function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`
}

function formatSize(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function TraceBlock({ turn }: { turn: Turn }) {
  const { t, tp } = useI18n()
  // Màn hẹp thì thu gọn sẵn để câu trả lời không bị đẩy xuống quá xa.
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 700px)').matches)
  if (turn.steps.length === 0) return null

  return (
    <section className={styles.trace} aria-label={t('trace.label')}>
      <button type="button" className={styles.head} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{t('trace.title')}</span>
        <span>
          {tp('chat.toolCalls', turn.steps.length)} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </span>
      </button>
      {open && (
        <ol className={styles.list}>
          {turn.steps.map((s, i) => (
            <li key={s.id} className={styles.row}>
              <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
              <span className={styles.name}>{s.name}</span>
              <span className={styles.args} title={describeArgs(s)}>
                {describeArgs(s)}
              </span>
              <span className={styles.meta}>
                {s.status === 'running' ? (
                  <span className={styles.running}>{t('trace.running')}</span>
                ) : (
                  <>
                    {t('trace.chars', { n: formatSize(s.chars ?? 0) })} · {formatMs(s.ms ?? 0)}
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
