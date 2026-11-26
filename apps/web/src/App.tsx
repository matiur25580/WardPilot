import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';

type Identity = {
  user: { id: string; email: string; firstName: string; lastName: string };
  organization: { id: string; name: string; slug: string; role: string };
};
type Session = Identity & { accessToken: string; tokenType: 'Bearer'; expiresIn: string };
type ApiEnvelope<T> = { success: boolean; data?: T; error?: { code: string; message: string; details?: Record<string, string[]> } };

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...options.headers },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message || 'The request could not be completed.');
  }
  return payload.data;
}

export default function App() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', organizationName: '', email: '', password: '' });

  useEffect(() => {
    let active = true;
    async function restoreSession() {
      try {
        const tokens = await apiRequest<{ accessToken: string; tokenType: 'Bearer'; expiresIn: string }>('/auth/refresh', { method: 'POST' });
        const identity = await apiRequest<Identity>('/auth/me', { method: 'GET' }, tokens.accessToken);
        if (active) setSession({ ...identity, ...tokens });
      } catch {
        // A missing or expired refresh cookie simply leaves the visitor signed out.
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void restoreSession();
    return () => { active = false; };
  }, []);

  function updateField(event: ChangeEvent<HTMLInputElement>) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const path = mode === 'register' ? '/auth/register' : '/auth/login';
      const body = mode === 'register'
        ? form
        : { email: form.email, password: form.password };
      const result = await apiRequest<Session>(path, { method: 'POST', body: JSON.stringify(body) });
      setSession(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try { await apiRequest<{ message: string }>('/auth/logout', { method: 'POST' }); } catch { /* The local session is cleared even if the server is unreachable. */ }
    setSession(null);
    setForm({ firstName: '', lastName: '', organizationName: '', email: '', password: '' });
  }

  if (checkingSession) return <main className="auth-shell"><div className="auth-card loading-card">Restoring your secure session…</div></main>;

  if (session) {
    return <main className="auth-shell"><nav className="topbar"><a className="brand" href="/"><span className="brand-mark">W</span><span>wardpilot</span></a><span className="environment"><i /> Secure workspace</span></nav><section className="welcome-card"><div className="eyebrow"><span /> WORKSPACE ACCESS CONFIRMED</div><h1>Welcome back,<br /><em>{session.user.firstName}.</em></h1><p className="intro">You are signed in to <strong>{session.organization.name}</strong> as <strong>{session.organization.role}</strong>. Your workspace identity and organization membership have been verified.</p><div className="session-details"><div><span>ACCOUNT</span><strong>{session.user.email}</strong></div><div><span>ORGANIZATION</span><strong>{session.organization.name}</strong></div><div><span>ROLE</span><strong>{session.organization.role}</strong></div></div><button className="primary-button" onClick={() => void signOut()}>Sign out</button></section><footer><span>WARDPILOT</span><span>Organization-scoped access · Milestone 02</span></footer></main>;
  }

  return <main className="auth-shell">
    <nav className="topbar"><a className="brand" href="/"><span className="brand-mark">W</span><span>wardpilot</span></a><span className="environment"><i /> Identity &amp; access</span></nav>
    <section className="auth-layout">
      <div className="auth-copy"><div className="eyebrow"><span /> HOSPITAL OPERATIONS INTELLIGENCE</div><h1>Every team.<br /><em>One trusted</em><br />workspace.</h1><p className="intro">A secure foundation for hospital teams. Your account is connected to an organization, with access governed by your membership role.</p><div className="trust-points"><span>01 / Organization-scoped identity</span><span>02 / Role-aware permissions</span><span>03 / Rotating secure sessions</span></div></div>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-tabs"><button className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => { setMode('register'); setError(''); }}>Create workspace</button></div>
        <div className="form-heading"><span className="kicker">WARDPILOT IDENTITY</span><h2 id="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2><p>{mode === 'login' ? 'Sign in to continue to your hospital workspace.' : 'Start by creating an account and your organization.'}</p></div>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'register' && <div className="field-row"><label>First name<input name="firstName" value={form.firstName} onChange={updateField} autoComplete="given-name" required maxLength={80} /></label><label>Last name<input name="lastName" value={form.lastName} onChange={updateField} autoComplete="family-name" required maxLength={80} /></label></div>}
          {mode === 'register' && <label>Organization name<input name="organizationName" value={form.organizationName} onChange={updateField} placeholder="e.g. Northside Hospital" required minLength={2} maxLength={120} /></label>}
          <label>Work email<input type="email" name="email" value={form.email} onChange={updateField} autoComplete="email" placeholder="you@hospital.com" required maxLength={254} /></label>
          <label>Password<input type="password" name="password" value={form.password} onChange={updateField} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'register' ? 'At least 12 characters' : 'Enter your password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} /></label>
          {mode === 'register' && <p className="hint">Use 12+ characters with uppercase, lowercase and a number.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button full-button" type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create organization'} <span>↗</span></button>
        </form>
        <p className="security-note"><span>◆</span> Refresh credentials are stored in an HTTP-only cookie. Access tokens remain in memory.</p>
      </section>
    </section>
    <footer><span>WARDPILOT</span><span>Identity foundation · Milestone 02</span></footer>
  </main>;
}
