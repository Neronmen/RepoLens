import { useI18n } from '../i18n'
import styles from './TraceDemo.module.css'

interface Step {
  n: string
  tool: string | null // null = bước trả lời cuối, không phải tool call
  arg: string
  size?: string // số ký tự trả về (đã rút gọn)
  time?: string
}

// Dữ liệu minh hoạ: một lượt hỏi thật về cơ chế rotate key của itsdangerous.
const STEPS: Step[] = [
  { n: '01', tool: 'search_code', arg: '"rotate rotation"', size: '4.9k', time: '2ms' },
  { n: '02', tool: 'read_file', arg: 'signer.py 65-115', size: '2.7k', time: '1ms' },
  { n: '03', tool: 'read_file', arg: 'signer.py 116-210', size: '4.5k', time: '0.4ms' },
  { n: '04', tool: null, arg: '',  },
]

export default function TraceDemo() {
  const { t } = useI18n()
  return (
    <div className={styles.term} data-reveal data-term>
      <div className={styles.bar} aria-hidden="true">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.title}>{t('landing.trace.barTitle', { repo: 'pallets/itsdangerous' })}</span>
      </div>
      <div className={styles.body}>
        {STEPS.map((s) => (
          <div key={s.n} className={styles.line} data-term-line>
            <span className={styles.n}>{s.n}</span>
            <span>
              {s.tool && <span className={styles.tool}>{s.tool} </span>}
              <span className={styles.arg}>{s.tool ? s.arg : t('landing.trace.answerArg')}</span>{' '}
              <span className={styles.meta}>
                {s.tool ? t('landing.trace.chars', { size: s.size ?? '', time: s.time ?? '' }) : t('landing.trace.answerMeta')}
              </span>
            </span>
          </div>
        ))}
        <div className={`${styles.line} ${styles.total}`} data-term-line>
          <span className={styles.meta}>{t('landing.trace.total')}</span>
          <span className={styles.cursor} aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
