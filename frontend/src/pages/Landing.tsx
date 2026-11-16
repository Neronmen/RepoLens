import { useRef } from 'react'
import Logo from '../components/Logo'
import GraphScene from '../landing/GraphScene'
import RepoForm from '../landing/RepoForm'
import TraceDemo from '../landing/TraceDemo'
import { useLandingMotion } from '../landing/useLandingMotion'
import styles from './Landing.module.css'

const REPO_URL = 'https://github.com/Neronmen/RepoLens'

const STEPS = [
  {
    n: '01',
    title: 'Index',
    text: 'The repo is downloaded, filtered to real source files, split into overlapping chunks and stored for full-text search.',
  },
  {
    n: '02',
    title: 'Investigate',
    text: 'An agent calls search, grep and read tools over several steps. Read-only, scoped to one repo, capped at six steps.',
  },
  {
    n: '03',
    title: 'Cite',
    text: 'Every claim links to file and line range. Each citation is checked against the index, so invented ones get flagged.',
  },
]

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null)
  useLandingMotion(rootRef)

  return (
    <div className={styles.page} ref={rootRef}>
      <header className={styles.header}>
        <div className={styles.container}>
          <div className={styles.navRow}>
            <Logo />
            <nav aria-label="Primary" className={styles.nav}>
              <a href="#how">How it works</a>
              <a href="#trace">Trace</a>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
                GitHub
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section className={`${styles.container} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.heroText}>
            <p className={styles.eyebrow} data-hero="eyebrow">
              Agentic code Q&amp;A
            </p>
            <h1 id="hero-title" className={styles.title}>
              <span className={styles.lineMask}>
                <span className={styles.line} data-hero="line">
                  Ask a repo.
                </span>
              </span>
              <span className={styles.lineMask}>
                <span className={styles.line} data-hero="line">
                  Get receipts.
                </span>
              </span>
            </h1>
            <p className={styles.lead} data-hero="lead">
              Paste any public GitHub repo. An agent searches, reads and cites the exact lines behind every answer, and
              you can watch each step it takes.
            </p>
            <RepoForm />
          </div>
          <div className={styles.visual} data-hero="visual">
            <GraphScene />
          </div>
        </section>

        <section id="how" className={`${styles.container} ${styles.section}`} aria-labelledby="how-title">
          <p className={styles.kicker} data-reveal>
            How it works
          </p>
          <h2 id="how-title" className={styles.h2} data-reveal>
            Three moves. No guessing.
          </h2>
          <ol className={styles.steps} data-stagger>
            {STEPS.map((s) => (
              <li key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepText}>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="trace" className={`${styles.container} ${styles.section} ${styles.trace}`} aria-labelledby="trace-title">
          <div className={styles.traceText}>
            <p className={styles.kicker} data-reveal>
              Trace
            </p>
            <h2 id="trace-title" className={styles.h2} data-reveal>
              Watch it think, step by step.
            </h2>
            <p className={styles.traceLead} data-reveal>
              Each tool call, its arguments, how long it took and how much text came back. Nothing is hidden behind a
              spinner.
            </p>
          </div>
          <TraceDemo />
        </section>
      </main>

      <footer className={styles.container}>
        <div className={styles.footer}>
          <span className={styles.brand}>repolens · built in public</span>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={styles.source}>
            View source on GitHub ↗
          </a>
        </div>
      </footer>
    </div>
  )
}
