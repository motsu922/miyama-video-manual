import { lazy, Suspense, useRef, useState, type FormEvent } from 'react'
import { Eye, EyeOff, LockKeyhole, LogIn } from 'lucide-react'
import logo from './assets/miyama-logo.png'
import './PasswordGate.css'

// Convenience screen lock only; Firebase authorization is independent of this gate.
const passwordDigest = '72c8fbca2e34f6fbaca422bf415751495635e76d260b569c93828e31be5792db'
const sessionKey = 'miyama-manual-screen-unlock-v1'
const App = lazy(() => import('./App.tsx'))

function hasUnlockedSession() {
  try {
    return sessionStorage.getItem(sessionKey) === passwordDigest
  } catch {
    return false
  }
}

export default function PasswordGate() {
  const [unlocked, setUnlocked] = useState(hasUnlockedSession)
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (checking) return
    setChecking(true)
    setError('')
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
      const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
      if (digest !== passwordDigest) {
        setError('パスワードが違います。もう一度入力してください。')
        inputRef.current?.focus()
        inputRef.current?.select()
        return
      }
      try {
        sessionStorage.setItem(sessionKey, passwordDigest)
      } catch {
        // Storage may be disabled; the current page can still be unlocked in memory.
      }
      setPassword('')
      setUnlocked(true)
    } catch {
      setError('パスワードを確認できませんでした。HTTPSの公開サイトから開き直してください。')
    } finally {
      setChecking(false)
    }
  }

  if (unlocked) return <Suspense fallback={<p className="manual-access-loading" role="status">読み込み中…</p>}><App /></Suspense>

  return <main className="manual-access-screen">
    <section className="manual-access-panel" aria-labelledby="manual-access-title">
      <img src={logo} alt="MIYAMA" className="manual-access-logo" />
      <h1 id="manual-access-title">ミヤマ工業 WEBマニュアル</h1>
      <form onSubmit={unlock}>
        <label htmlFor="manual-access-password"><LockKeyhole size={18} aria-hidden="true" />閲覧パスワード</label>
        <div className="manual-access-input">
          <input id="manual-access-password" ref={inputRef} type={visible ? 'text' : 'password'}
            value={password} onChange={event => { setPassword(event.target.value); setError('') }}
            autoComplete="current-password" autoCapitalize="none" spellCheck={false} required
            aria-invalid={Boolean(error)} aria-describedby={error ? 'manual-access-error' : undefined} />
          <button type="button" className="manual-access-visibility" aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'}
            title={visible ? 'パスワードを隠す' : 'パスワードを表示'} aria-pressed={visible} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {error && <p id="manual-access-error" className="manual-access-error" role="alert">{error}</p>}
        <button className="manual-access-submit" type="submit" disabled={checking || !password}>
          <LogIn size={18} aria-hidden="true" />{checking ? '確認中…' : 'マニュアルを開く'}
        </button>
      </form>
    </section>
  </main>
}

