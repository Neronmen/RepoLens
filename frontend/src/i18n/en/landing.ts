// Chữ của trang landing (do phần landing điền).
const landing = {
  'landing.nav.label': 'Primary',
  'landing.nav.how': 'How it works',
  'landing.nav.trace': 'Trace',
  'landing.nav.github': 'GitHub',

  'landing.hero.eyebrow': 'Agentic code Q&A',
  'landing.hero.line1': 'Ask a repo.',
  'landing.hero.line2': 'Get receipts.',
  'landing.hero.lead':
    'Paste any public GitHub repo. An agent searches, reads and cites the exact lines behind every answer, and you can watch each step it takes.',

  'landing.form.label': 'GitHub repository URL',
  'landing.form.submit': 'Index repo →',
  'landing.form.try': 'try',
  'landing.form.error':
    'That does not look like a GitHub repo. Try owner/repo or https://github.com/owner/repo.',

  'landing.how.kicker': 'How it works',
  'landing.how.title': 'Three moves. No guessing.',
  'landing.how.step1.title': 'Index',
  'landing.how.step1.text':
    'The repo is downloaded, filtered to real source files, split into overlapping chunks and stored for full-text search.',
  'landing.how.step2.title': 'Investigate',
  'landing.how.step2.text':
    'An agent calls search, grep and read tools over several steps. Read-only, scoped to one repo, capped at six steps.',
  'landing.how.step3.title': 'Cite',
  'landing.how.step3.text':
    'Every claim links to file and line range. Each citation is checked against the index, so invented ones get flagged.',

  'landing.trace.kicker': 'Trace',
  'landing.trace.title': 'Watch it think, step by step.',
  'landing.trace.lead':
    'Each tool call, its arguments, how long it took and how much text came back. Nothing is hidden behind a spinner.',
  'landing.trace.chars': '→ {size} chars · {time}',
  'landing.trace.answerArg': 'answer',
  'landing.trace.answerMeta': '→ 6 citations · all valid',
  'landing.trace.total': '10,351 in · 575 out · 4 tool calls · 6.5s',
  'landing.trace.barTitle': 'trace · {repo}',

  'landing.footer.brand': 'repolens · built in public',
  'landing.footer.source': 'View source on GitHub ↗',

  'landing.scene.label': "Code files drawn as a graph, with the agent's path highlighted",
  'landing.scene.badgeLive': 'live: agent walking the repo',
  'landing.scene.badgeStatic': 'agent path: search, read, cite',
} as const

export default landing
