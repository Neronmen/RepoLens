import { useState } from 'react'
import type { Step, Turn } from './turns'
import styles from './TraceBlock.module.css'

/** Tóm tắt tham số của một công cụ thành một dòng ngắn dễ đọc. */
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

function formatChars(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k chars` : `${n} chars`
}

export default function TraceBlock({ turn }: { turn: Turn }) {
  // Màn hẹp thì thu gọn sẵn để câu trả lời không bị đẩy xuống quá xa.
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 700px)').matches)
  if (turn.steps.length === 0) return null

  const label = `${turn.steps.length} tool call${turn.steps.length === 1 ? '' : 's'}`

  return (
    <section className={styles.trace} aria-label="Agent trace">
      <button type="button" className={styles.head} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>trace</span>
        <span>
          {label} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
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
                  <span className={styles.running}>running_</span>
                ) : (
                  <>
                    {formatChars(s.chars ?? 0)} · {formatMs(s.ms ?? 0)}
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
