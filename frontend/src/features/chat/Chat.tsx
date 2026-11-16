import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Answer, { Sources, type OpenCode } from './Answer'
import TraceBlock from './TraceBlock'
import type { Turn } from './turns'
import styles from './Chat.module.css'

const SUGGESTIONS = [
  'Give me a quick tour of this codebase',
  'Where is the main entry point?',
  'How does this project handle errors?',
]

function formatUsage(t: Turn): string | null {
  const u = t.usage
  if (!u) return null
  const parts = [`${u.input_tokens.toLocaleString('en-US')} in`, `${u.output_tokens.toLocaleString('en-US')} out`]
  parts.push(`${u.tool_calls} tool call${u.tool_calls === 1 ? '' : 's'}`, `${(u.ms / 1000).toFixed(1)}s`)
  return parts.join(' · ')
}

export default function Chat({
  turns,
  busy,
  onAsk,
  onStop,
  onOpenCode,
}: {
  turns: Turn[]
  busy: boolean
  onAsk: (q: string) => void
  onStop: () => void
  onOpenCode: OpenCode
}) {
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

  return (
    <div className={styles.chat}>
      <div className={styles.scroll} ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversation">
        {turns.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Ask anything about this repo.</p>
            <p className={styles.emptyHint}>The agent will search and read the code, then cite the exact lines.</p>
            <div className={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className={styles.suggestion} onClick={() => ask(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => <TurnView key={t.id} turn={t} onOpenCode={onOpenCode} />)
        )}
      </div>
      <Composer busy={busy} onSend={ask} onStop={onStop} />
    </div>
  )
}

function TurnView({ turn, onOpenCode }: { turn: Turn; onOpenCode: OpenCode }) {
  const streaming = turn.status === 'streaming'
  const usage = formatUsage(turn)
  const waiting = streaming && turn.steps.length === 0 && !turn.answer

  return (
    <article className={styles.turn} aria-busy={streaming}>
      <div className={styles.question}>{turn.question}</div>

      <TraceBlock turn={turn} />

      {waiting && <p className={styles.thinking}>Thinking<span className={styles.dots} aria-hidden="true">_</span></p>}
      {turn.notes.length > 0 && turn.answer === '' && streaming && (
        <p className={styles.note}>{turn.notes[turn.notes.length - 1]}</p>
      )}

      <Answer text={turn.answer} citations={turn.citations} onOpen={onOpenCode} />
      {turn.status === 'done' && <Sources citations={turn.citations} onOpen={onOpenCode} />}

      {turn.status === 'stopped' && <p className={styles.stopped}>Stopped.</p>}
      {turn.status === 'error' && (
        <p className={styles.error} role="alert">
          {turn.error}
        </p>
      )}
      {usage && turn.status !== 'streaming' && <p className={styles.usage}>{usage}</p>}
    </article>
  )
}

function Composer({ busy, onSend, onStop }: { busy: boolean; onSend: (q: string) => void; onStop: () => void }) {
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
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor="ask-input" className="sr-only">
        Ask a question about this repo
      </label>
      <textarea
        id="ask-input"
        ref={area}
        rows={1}
        value={value}
        maxLength={2000}
        placeholder="Ask about this codebase…"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {busy ? (
        <button type="button" className={styles.stop} onClick={onStop} aria-label="Stop the answer">
          <span aria-hidden="true" className={styles.stopIcon} />
        </button>
      ) : (
        <button type="submit" className={styles.send} aria-label="Send question" disabled={!value.trim()}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </form>
  )
}
