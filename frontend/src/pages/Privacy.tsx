import { Link } from 'react-router-dom'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import { useI18n } from '../i18n'
import { usePageMeta } from '../lib/usePageMeta'
import styles from './Privacy.module.css'

const REPO_ISSUES = 'https://github.com/Neronmen/RepoLens/issues'
const SECTIONS = ['collect', 'use', 'ai', 'store', 'share', 'rights', 'contact'] as const

/** Chính sách quyền riêng tư. Google yêu cầu có trang này mới cho phép mọi người đăng nhập bằng Google. */
export default function Privacy() {
  const { t } = useI18n()
  usePageMeta(`${t('privacy.title')} · RepoLens`, true)
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Logo />
        <LanguageToggle />
      </header>
      <main className={styles.main}>
        <h1>{t('privacy.title')}</h1>
        <p className={styles.updated}>{t('privacy.updated')}</p>
        <p>{t('privacy.intro')}</p>
        {SECTIONS.map((s) => (
          <section key={s}>
            <h2>{t(`privacy.${s}.h`)}</h2>
            <p>{t(`privacy.${s}.p`)}</p>
          </section>
        ))}
        <p>
          <a href={REPO_ISSUES} target="_blank" rel="noopener noreferrer">
            {REPO_ISSUES}
          </a>
        </p>
        <p>
          <Link to="/">← RepoLens</Link>
        </p>
      </main>
    </div>
  )
}
