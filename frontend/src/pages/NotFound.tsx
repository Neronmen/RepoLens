import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import { useI18n } from '../i18n'
import { usePageMeta } from '../lib/usePageMeta'
import styles from './NotFound.module.css'

export default function NotFound() {
  const { t } = useI18n()
  usePageMeta('404 · RepoLens', false)
  return (
    <main className={styles.page}>
      <Logo />
      <div className={styles.body}>
        <p className={styles.code}>404</p>
        <h1>{t('notfound.title')}</h1>
        <p className={styles.hint}>{t('notfound.hint')}</p>
        <Link to="/" className={styles.back}>
          {t('notfound.back')}
        </Link>
      </div>
    </main>
  )
}
