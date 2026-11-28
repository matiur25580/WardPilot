import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import PatientFlowPanel from './PatientFlowPanel';
import OperationsPanel from './OperationsPanel';
import './operations.css';

type Identity = {
  user: { id: string; email: string; firstName: string; lastName: string };
  organization: { id: string; name: string; slug: string; role: string };
};
type Session = Identity & { accessToken: string; tokenType: 'Bearer'; expiresIn: string };
type Facility = { _id: string; name: string; code: string; type: string; status: string; address: { city: string; country: string } };
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
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilityForm, setFacilityForm] = useState({ name: '', code: '', type: 'hospital', line1: '', city: '', country: 'India' });
  const [registryError, setRegistryError] = useState('');
  const [registryLoading, setRegistryLoading] = useState(false);
  const canManageRegistry = ['owner', 'admin', 'manager'].includes(session?.organization.role || '');

  useEffect(() => {
    if (!session?.accessToken) { setFacilities([]); return; }
    let active = true;
    void apiRequest<Facility[]>('/resources/facilities', {}, session.accessToken)
      .then((rows) => { if (active) setFacilities(rows); })
      .catch((caught) => { if (active) setRegistryError(caught instanceof Error ? caught.message : 'Unable to load facilities.'); });
    return () => { active = false; };
  }, [session?.accessToken]);

  async function createFacility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setRegistryLoading(true); setRegistryError('');
    try {
      const created = await apiRequest<Facility>('/resources/facilities', { method: 'POST', body: JSON.stringify({ name: facilityForm.name, code: facilityForm.code, type: facilityForm.type, address: { line1: facilityForm.line1, city: facilityForm.city, country: facilityForm.country } }) }, session.accessToken);
      setFacilities((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setFacilityForm({ name: '', code: '', type: 'hospital', line1: '', city: '', country: 'India' });
    } catch (caught) { setRegistryError(caught instanceof Error ? caught.message : 'Unable to create facility.'); }
    finally { setRegistryLoading(false); }
  }

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
    return <main className="auth-shell workspace-shell">
      <nav className="topbar"><a className="brand" href="/"><span className="brand-mark">W</span><span>wardpilot</span></a><div className="workspace-nav"><span className="environment"><i /> {session.organization.name}</span><button className="signout-button" onClick={() => void signOut()}>Sign out</button></div></nav>
      <section className="workspace-heading"><div><div className="eyebrow"><span /> HOSPITAL OPERATIONS / RESOURCE DIRECTORY</div><h1>Hospital <em>registry.</em></h1><p className="intro">A governed directory of facilities and the physical resources that support care delivery.</p></div><div className="role-chip">{session.organization.role} access</div></section>
      <section className="registry-stats"><article><span>FACILITIES</span><strong>{facilities.length.toString().padStart(2, '0')}</strong><small>Registered locations</small></article><article><span>ORGANIZATION</span><strong className="stat-text">{session.organization.name}</strong><small>Tenant-scoped workspace</small></article><article><span>ACCESS CONTROL</span><strong className="stat-text">Verified</strong><small>Role: {session.organization.role}</small></article></section>
      <section className="registry-layout"><div className="facility-panel"><div className="panel-heading"><div><span className="kicker">RESOURCE DIRECTORY</span><h2>Facilities</h2></div><span className="count-pill">{facilities.length} locations</span></div>
        {registryError && <p className="form-error" role="alert">{registryError}</p>}
        {facilities.length === 0 ? <div className="empty-state"><span>⌂</span><strong>No facilities registered yet</strong><p>Add your first hospital or care location to begin structuring departments, buildings, wards and beds.</p></div> : <div className="facility-list">{facilities.map((facility) => <article className="facility-row" key={facility._id}><div className="facility-icon">H</div><div className="facility-info"><strong>{facility.name}</strong><span>{facility.code} · {facility.type.replace('_', ' ')}</span><small>{facility.address.city}, {facility.address.country}</small></div><span className="status">{facility.status}</span></article>)}</div>}
      </div>
      <aside className="create-panel"><span className="kicker">NEW LOCATION</span><h2>Register a facility</h2><p>Create a tenant-owned hospital, clinic or specialty centre.</p>
        {canManageRegistry ? <form onSubmit={(event) => void createFacility(event)}><label>Facility name<input value={facilityForm.name} onChange={(event) => setFacilityForm({ ...facilityForm, name: event.target.value })} required minLength={2} maxLength={140} placeholder="e.g. Northside Hospital" /></label><label>Facility code<input value={facilityForm.code} onChange={(event) => setFacilityForm({ ...facilityForm, code: event.target.value })} required minLength={2} maxLength={24} placeholder="NORTH-01" /></label><label>Facility type<select value={facilityForm.type} onChange={(event) => setFacilityForm({ ...facilityForm, type: event.target.value })}><option value="hospital">Hospital</option><option value="clinic">Clinic</option><option value="urgent_care">Urgent care</option><option value="specialty_center">Specialty centre</option></select></label><label>Street address<input value={facilityForm.line1} onChange={(event) => setFacilityForm({ ...facilityForm, line1: event.target.value })} required minLength={2} maxLength={160} placeholder="Street and building" /></label><div className="field-row"><label>City<input value={facilityForm.city} onChange={(event) => setFacilityForm({ ...facilityForm, city: event.target.value })} required minLength={2} maxLength={80} /></label><label>Country<input value={facilityForm.country} onChange={(event) => setFacilityForm({ ...facilityForm, country: event.target.value })} required minLength={2} maxLength={80} /></label></div><button className="primary-button full-button" type="submit" disabled={registryLoading}>{registryLoading ? 'Saving…' : 'Add facility'} <span>↗</span></button></form> : <p className="permission-note">Your membership role can view facilities. Ask an organization owner, admin or manager to register new locations.</p>}
      </aside></section>
      <PatientFlowPanel accessToken={session.accessToken} facilities={facilities} />
      <OperationsPanel accessToken={session.accessToken} facilities={facilities} role={session.organization.role} />
      <section className="registry-roadmap"><div><span className="kicker">RESOURCE HIERARCHY</span><h2>One connected physical model</h2></div><div className="hierarchy"><span>Facility</span><b>→</b><span>Building / Department</span><b>→</b><span>Ward</span><b>→</b><span>Bed inventory</span></div><p>Departments, buildings, wards and bed status workflows are exposed through the tenant-scoped resources API. Bed status transitions are validated to preserve cleaning and maintenance steps.</p></section>
      <footer><span>WARDPILOT</span><span>Hospital &amp; resource registry · Milestone 03</span></footer>
    </main>;
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
