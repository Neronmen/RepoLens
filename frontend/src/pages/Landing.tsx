import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

// Bản tạm để dự án chạy được. Trang landing thật (cảnh 3D, GSAP) sẽ thay thế file này.
export default function Landing() {
  const navigate = useNavigate()
  const [repo, setRepo] = useState('pallets/itsdangerous')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (repo.trim()) navigate(`/index?repo=${encodeURIComponent(repo.trim())}`)
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>RepoLens</h1>
      <form onSubmit={submit}>
        <label>
          GitHub repo <input value={repo} onChange={(e) => setRepo(e.target.value)} />
        </label>
        <button type="submit">Index repo</button>
      </form>
    </main>
  )
}
