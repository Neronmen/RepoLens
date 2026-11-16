import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import styles from './NotFound.module.css'

export default function NotFound() {
  return (
    <main className={styles.page}>
      <Logo />
      <div className={styles.body}>
        <p className={styles.code}>404</p>
        <h1>Nothing indexed here.</h1>
        <p className={styles.hint}>This page doesn't exist, or the repo hasn't been added on this server yet.</p>
        <Link to="/" className={styles.back}>
          ← Back to start
        </Link>
      </div>
    </main>
  )
}
