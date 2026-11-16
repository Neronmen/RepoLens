import { type FormEvent, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './RepoForm.module.css'

const EXAMPLES = ['pallets/itsdangerous', 'tiangolo/fastapi']
const SLUG = /^[\w.-]+\/[\w.-]+$/

// Chấp nhận `owner/repo` hoặc link GitHub, có thể kèm `.git` hay dấu `/` ở cuối.
// Chỉ kiểm tra nhẹ ở client; backend mới là nơi quyết định repo có tồn tại không.
function looksLikeRepo(raw: string): boolean {
  const slug = raw
    .replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
  return SLUG.test(slug)
}

export default function RepoForm() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('pallets/itsdangerous')
  const [error, setError] = useState('')
  const inputId = useId()
  const errorId = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    const repo = value.trim()
    if (!looksLikeRepo(repo)) {
      setError('That does not look like a GitHub repo. Try owner/repo or https://github.com/owner/repo.')
      inputRef.current?.focus()
      return
    }
    navigate(`/index?repo=${encodeURIComponent(repo)}`)
  }

  function pick(example: string) {
    setValue(example)
    setError('')
    inputRef.current?.focus()
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.form} onSubmit={submit} noValidate data-hero="form">
        <label htmlFor={inputId} className="sr-only">
          GitHub repository URL
        </label>
        <div className={`${styles.field} ${error ? styles.invalid : ''}`}>
          <span className={styles.prefix} aria-hidden="true">
            github.com/
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError('')
            }}
          />
        </div>
        <button type="submit" className={styles.submit}>
          Index repo →
        </button>
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>

      <div className={styles.chips} data-hero="chips">
        <span>try</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className={styles.chip} onClick={() => pick(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}
