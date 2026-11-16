import styles from './TraceDemo.module.css'

interface Step {
  n: string
  tool: string | null // null = bước trả lời cuối, không phải tool call
  arg: string
  meta: string
}

// Dữ liệu minh hoạ: một lượt hỏi thật về cơ chế rotate key của itsdangerous.
const STEPS: Step[] = [
  { n: '01', tool: 'search_code', arg: '"rotate rotation"', meta: '→ 4.9k chars · 2ms' },
  { n: '02', tool: 'read_file', arg: 'signer.py 65-115', meta: '→ 2.7k chars · 1ms' },
  { n: '03', tool: 'read_file', arg: 'signer.py 116-210', meta: '→ 4.5k chars · 0.4ms' },
  { n: '04', tool: null, arg: 'answer', meta: '→ 6 citations · all valid' },
]

export default function TraceDemo() {
  return (
    <div className={styles.term} data-reveal data-term>
      <div className={styles.bar} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.title}>trace · pallets/itsdangerous</span>
      </div>
      <div className={styles.body}>
        {STEPS.map((s) => (
          <div key={s.n} className={styles.line} data-term-line>
            <span className={styles.n}>{s.n}</span>
            <span>
              {s.tool && <span className={styles.tool}>{s.tool} </span>}
              <span className={styles.arg}>{s.arg}</span> <span className={styles.meta}>{s.meta}</span>
            </span>
          </div>
        ))}
        <div className={`${styles.line} ${styles.total}`} data-term-line>
          <span className={styles.meta}>10,351 in · 575 out · 4 tool calls · 6.5s</span>
          <span className={styles.cursor} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
