import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles/tokens.css'

// Mỗi trang là một gói riêng: người vào landing không phải tải code của trang hỏi đáp.
const Landing = lazy(() => import('./pages/Landing'))
const Indexing = lazy(() => import('./pages/Indexing'))
const RepoPage = lazy(() => import('./pages/RepoPage'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Privacy = lazy(() => import('./pages/Privacy'))
const History = lazy(() => import('./pages/History'))
const ConversationPage = lazy(() => import('./pages/ConversationPage'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/index" element={<Indexing />} />
          <Route path="/r/:repoId" element={<RepoPage />} />
          <Route path="/c/:cid" element={<ConversationPage />} />
          <Route path="/history" element={<History />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
