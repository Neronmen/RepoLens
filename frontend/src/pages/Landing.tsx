import { useEffect, useRef, useState } from 'react'
import LanguageToggle from '../components/LanguageToggle'
import Logo from '../components/Logo'
import UserMenu from '../features/auth/UserMenu'
import { useI18n } from '../i18n'
import GraphScene from '../landing/GraphScene'
import RepoForm from '../landing/RepoForm'
import TraceDemo from '../landing/TraceDemo'
import { useLandingMotion } from '../landing/useLandingMotion'
import { onAnchorClick } from '../lib/smoothScroll'
import styles from './Landing.module.css'

const REPO_URL = 'https://github.com/Neronmen/RepoLens'

const STEPS = [
  { n: '01', title: 'landing.how.step1.title', text: 'landing.how.step1.text' },
  { n: '02', title: 'landing.how.step2.title', text: 'landing.how.step2.text' },
  { n: '03', title: 'landing.how.step3.title', text: 'landing.how.step3.text' },
] as const

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null)
  useLandingMotion(rootRef)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const { t } = useI18n()

  return (
    <div className={styles.page} ref={rootRef}>
      <header className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}>
        <div className={styles.container}>
          <div className={styles.navRow}>
            <Logo />
            <nav aria-label={t('landing.nav.label')} className={styles.nav}>
              <a href="#how" onClick={(e) => onAnchorClick(e, 'how', 0)}>{t('landing.nav.how')}</a>
              <a href="#trace" onClick={(e) => onAnchorClick(e, 'trace', 0)}>{t('landing.nav.trace')}</a>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                {t('landing.nav.github')}
              </a>
              <LanguageToggle />
              <UserMenu />
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroText}>
            <p className={styles.eyebrow} data-hero="eyebrow">
              {t('landing.hero.eyebrow')}
            </p>
            <h1 id="hero-title" className={styles.title}>
              <span className={styles.lineMask}>
                <span className={styles.line} data-hero="line">
                  {t('landing.hero.line1')}
                </span>
              </span>
              <span className={styles.lineMask}>
                <span className={styles.line} data-hero="line">
                  {t('landing.hero.line2')}
                </span>
              </span>
            </h1>
            <p className={styles.lead} data-hero="lead">
              {t('landing.hero.lead')}
            </p>
            <RepoForm />
          </div>
          <div className={styles.visual} data-hero="visual">
            <GraphScene />
          </div>
        </section>

        <section id="how" className={`${styles.container} ${styles.section}`} aria-labelledby="how-title">
          <p className={styles.kicker} data-reveal>
            {t('landing.how.kicker')}
          </p>
          <h2 id="how-title" className={styles.h2} data-reveal>
            {t('landing.how.title')}
          </h2>
          <ol className={styles.steps} data-stagger>
            {STEPS.map((s) => (
              <li key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.stepTitle}>{t(s.title)}</h3>
                <p className={styles.stepText}>{t(s.text)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trace" className={`${styles.container} ${styles.section} ${styles.trace}`} aria-labelledby="trace-title">
          <div className={styles.traceText}>
            <p className={styles.kicker} data-reveal>
              {t('landing.trace.kicker')}
            </p>
            <h2 id="trace-title" className={styles.h2} data-reveal>
              {t('landing.trace.title')}
            </h2>
            <p className={styles.traceLead} data-reveal>
              {t('landing.trace.lead')}
            </p>
          </div>
          <TraceDemo />
        </section>
      </main>

      <footer className={styles.container}>
        <div className={styles.footer}>
          <span className={styles.brand}>{t('landing.footer.brand')}</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.source}>
            {t('landing.footer.source')}
          </a>
        </div>
      </footer>
    </div>
  )
}
