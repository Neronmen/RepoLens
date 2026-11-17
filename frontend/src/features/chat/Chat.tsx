import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '../../i18n'
import Answer, { Sources, type OpenCode } from './Answer'
import TraceBlock from './TraceBlock'
import type { Turn } from './turns'
import styles from './Chat.module.css'

export default function Chat({
  turns,
  busy,
  reconnecting = false,
  onAsk,
  onStop,
  onOpenCode,
}: {
  turns: Turn[]
  busy: boolean
  reconnecting?: boolean
  onAsk: (q: string) => void
  onStop: () => void
  onOpenCode: OpenCode
}) {
  const { t } = useI18n()
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  // Tự cuộn xuống theo câu trả lời đang hiện ra, nhưng nếu người dùng đã cuộn lên
  // đọc phần trước thì đừng kéo họ xuống.
  useEffect(() => {
    const el = scroller.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [turns])

  function onScroll() {
    const el = scroller.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function ask(q: string) {
    stickToBottom.current = true
    onAsk(q)
  }

  const suggestions = [t('chat.suggest1'), t('chat.suggest2'), t('chat.suggest3')]

  return (
    <div className={styles.chat}>
      <div className={styles.scroll} ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label={t('chat.log')}>
        {turns.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>{t('chat.emptyTitle')}</p>
            <p className={styles.emptyHint}>{t('chat.emptyHint')}</p>
            <div className={styles.suggestions}>
              {suggestions.map((s) => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, i) => (
            <TurnView
              key={turn.id}
              turn={turn}
              reconnecting={reconnecting && i === turns.length - 1}
              onOpenCode={onOpenCode}
              onRetry={!busy && i === turns.length - 1 ? () => ask(turn.question) : undefined}
            />
          ))
        )}
      </div>
      <Composer busy={busy} onSend={ask} onStop={onStop} />
    </div>
  )
}

function TurnView({
  turn,
  onOpenCode,
  onRetry,
  reconnecting,
}: {
  turn: Turn
  onOpenCode: OpenCode
  onRetry?: () => void
  reconnecting: boolean
}) {
  const { t, tp } = useI18n()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(turn.answer)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // trình duyệt chặn clipboard (trang không an toàn...) thì thôi, người dùng vẫn bôi đen chép tay được
    }
  }

  const streaming = turn.status === 'streaming'
  const waiting = streaming && turn.steps.length === 0 && !turn.answer
  const u = turn.usage

  return (
    <article className={styles.turn} aria-busy={streaming}>
      <div className={styles.question}>{turn.question}</div>

      <section className={styles.card}>
        <header className={styles.cardHead}>
          <span className={styles.author}>
            <svg width="16" height="16" viewBox="0 0 22 22" aria-hidden="true">
              <rect x="1" y="1" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M6 8l-3 3 3 3M16 8l3 3-3 3M12.5 6l-3 10" fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            RepoLens
          </span>
          {turn.status === 'done' && turn.answer && (
            <button type="button" className={styles.copy} onClick={copy}>
              {copied ? t('chat.copied') : t('chat.copy')}
            </button>
          )}
          {u && !streaming && (
            <span className={styles.cardMeta}>
              {t('trace.steps', { tools: tp('chat.toolCalls', u.tool_calls), secs: (u.ms / 1000).toFixed(1) })}
            </span>
          )}
        </header>

        <TraceBlock turn={turn} />

        <div className={styles.body}>
          {waiting && (
            <p className={styles.thinking}>
              {reconnecting ? t('chat.reconnecting') : t('chat.thinking')}
              <span className={styles.dots} aria-hidden="true">
                _
              </span>
            </p>
          )}
          {turn.notes.length > 0 && turn.answer === '' && streaming && (
            <p className={styles.note}>{turn.notes[turn.notes.length - 1]}</p>
          )}

          <Answer text={turn.answer} citations={turn.citations} onOpen={onOpenCode} />
          {turn.status === 'done' && <Sources citations={turn.citations} onOpen={onOpenCode} />}

          {turn.status === 'stopped' && <p className={styles.stopped}>{t('chat.stopped')}</p>}
          {turn.status === 'error' && (
            <div className={styles.error} role="alert">
              <p>{turn.error}</p>
              {onRetry && (
                <button type="button" className={styles.retry} onClick={onRetry}>
                  {t('chat.retry')}
                </button>
              )}
            </div>
          )}
          {turn.status === 'stopped' && onRetry && (
            <button type="button" className={styles.retry} onClick={onRetry}>
              {t('chat.retry')}
            </button>
          )}
        </div>
      </section>

      {u && !streaming && (
        <p className={styles.usage}>
          {t('chat.usage', {
            input: u.input_tokens.toLocaleString('en-US'),
            output: u.output_tokens.toLocaleString('en-US'),
            tools: tp('chat.toolCalls', u.tool_calls),
            secs: (u.ms / 1000).toFixed(1),
          })}
        </p>
      )}
    </article>
  )
}

function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (q: string) => void; onStop: () => void }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)

  // ô nhập cao dần theo nội dung, tối đa vài dòng
  useEffect(() => {
    const el = area.current
    if (!el) return
    // Ô rỗng thì để CSS (rows=1) tự quyết định chiều cao. Đo khi chưa có chữ từng cho ra
    // kết quả 160px (mức tối đa) ngay lúc vừa mở trang, làm ô nhập to bất thường.
    if (!value) {
      el.style.height = ''
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy || !value.trim()) return
    onSend(value)
    setValue('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter gửi, Shift+Enter xuống dòng. Đang gõ tiếng Việt/Nhật bằng bộ gõ (IME)
    // thì Enter là để chốt chữ, không phải gửi.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className={styles.composerWrap}>
      <form className={styles.composer} onSubmit={submit}>
        <label htmlFor="ask-input" className="sr-only">
          {t('chat.inputLabel')}
        </label>
        <textarea
          id="ask-input"
          ref={area}
          rows={1}
          value={value}
          maxLength={2000}
          placeholder={t('chat.placeholder')}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <button type="button" className={styles.stop} onClick={onStop} aria-label={t('chat.stop')}>
            <span aria-hidden="true" className={styles.stopIcon} />
          </button>
        ) : (
          <button type="submit" className={styles.send} aria-label={t('chat.send')} disabled={!value.trim()}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>
      <p className={styles.keys}>{t('chat.hint')}</p>
    </div>
  )
}
