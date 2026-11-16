import { Link } from 'react-router-dom'
import styles from './Logo.module.css'

export default function Logo() {
  return (
    <Link to="/" className={styles.logo} aria-label="RepoLens home">
      <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="1" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M6 8l-3 3 3 3M16 8l3 3-3 3M12.5 6l-3 10"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span>repolens</span>
    </Link>
  )
}
