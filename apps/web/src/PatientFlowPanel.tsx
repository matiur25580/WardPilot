import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Facility = { _id: string; name: string; code: string };
type Bed = { _id: string; label: string; status: string; facilityId: string; wardId?: { name?: string; code?: string } };
type Admission = {
  _id: string; status: 'admitted' | 'discharged'; admittedAt: string; admissionReason: string;
  patientId: { firstName: string; lastName: string; medicalRecordNumber: string };
  bedId: { _id: string; label: string; wardId?: { name?: string; code?: string } };
  facilityId: { _id: string; name: string };
};
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init, credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers },
  });
  const body = await response.json() as { success: boolean; data?: T; error?: { message: string } };
  if (!response.ok || !body.success || body.data === undefined) throw new Error(body.error?.message || 'Request failed.');
  return body.data;
}

export default function PatientFlowPanel({ accessToken, facilities }: { accessToken: string; facilities: Facility[] }) {
  const [admissions, setAdmissions] = useState<Admission[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ facilityId: '', bedId: '', medicalRecordNumber: '', firstName: '', lastName: '', admissionReason: '' });
  const [transferTargets, setTransferTargets] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [rows, availableBeds] = await Promise.all([
      request<Admission[]>('/patient-flow/admissions?status=admitted', accessToken),
      request<Bed[]>('/resources/beds?status=available', accessToken),
    ]);
    setAdmissions(rows);
    setBeds(availableBeds);
  }, [accessToken]);

  useEffect(() => { void refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Unable to load patient flow.')); }, [refresh]);

  async function admit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('/patient-flow/admissions', accessToken, { method: 'POST', body: JSON.stringify(form) });
      setForm({ facilityId: '', bedId: '', medicalRecordNumber: '', firstName: '', lastName: '', admissionReason: '' });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Admission failed.'); }
    finally { setBusy(false); }
  }

  async function discharge(id: string) {
    if (!window.confirm('Discharge this admission? The assigned bed will move to cleaning.')) return;
    setBusy(true); setError('');
    try { await request(`/patient-flow/admissions/${id}/discharge`, accessToken, { method: 'POST', body: JSON.stringify({}) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Discharge failed.'); }
    finally { setBusy(false); }
  }

  async function transfer(id: string) {
    const bedId = transferTargets[id];
    if (!bedId) return;
    setBusy(true); setError('');
    try { await request(`/patient-flow/admissions/${id}/transfer`, accessToken, { method: 'POST', body: JSON.stringify({ bedId, note: 'Operational bed transfer' }) }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Transfer failed.'); }
    finally { setBusy(false); }
  }

  return <section className="patient-flow">
    <div className="panel-heading"><div><span className="kicker">MILESTONE 04 / PATIENT FLOW</span><h2>Admissions &amp; bed movement</h2></div><span className="count-pill">{admissions.length} active</span></div>
    <p className="flow-intro">Operational admission records linked to the hospital registry. This is not a clinical record or EHR.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="flow-grid">
      <form className="create-panel admission-form" onSubmit={(event) => void admit(event)}>
        <span className="kicker">NEW ADMISSION</span><h3>Admit a patient</h3>
        <label>Facility<select required value={form.facilityId} onChange={e => setForm({...form, facilityId:e.target.value, bedId:''})}><option value="">Select facility</option>{facilities.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>
        <label>Available bed<select required value={form.bedId} onChange={e=>setForm({...form,bedId:e.target.value})}><option value="">Select bed</option>{beds.filter(b=>!form.facilityId || b.facilityId===form.facilityId).map(b=><option key={b._id} value={b._id}>{b.label}{b.wardId?.name ? ` · ${b.wardId.name}` : ''}</option>)}</select></label>
        <label>Medical record number<input required minLength={2} maxLength={32} value={form.medicalRecordNumber} onChange={e=>setForm({...form,medicalRecordNumber:e.target.value})} placeholder="MRN-1001"/></label>
        <div className="field-row"><label>First name<input required value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})}/></label><label>Last name<input required value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})}/></label></div>
        <label>Admission reason<input required minLength={2} maxLength={500} value={form.admissionReason} onChange={e=>setForm({...form,admissionReason:e.target.value})} placeholder="Operational admission reason"/></label>
        <button className="primary-button full-button" disabled={busy || !facilities.length}>{busy?'Processing…':'Create admission'} <span>↗</span></button>
      </form>
      <div className="admission-list"><div className="admission-list-heading"><h3>Current inpatients</h3><button className="signout-button" onClick={()=>void refresh()}>Refresh</button></div>
        {admissions.length===0 ? <div className="empty-state"><span>＋</span><strong>No active admissions</strong><p>New admissions will appear here with their current facility and bed assignment.</p></div> : admissions.map(a=><article className="admission-card" key={a._id}>
          <div className="admission-top"><div><strong>{a.patientId.firstName} {a.patientId.lastName}</strong><small>{a.patientId.medicalRecordNumber} · {a.facilityId.name}</small></div><span className="status">Admitted</span></div>
          <p>{a.admissionReason}</p><div className="bed-assignment"><span>ASSIGNED BED</span><strong>{a.bedId.label}{a.bedId.wardId?.name ? ` · ${a.bedId.wardId.name}` : ''}</strong></div>
          <div className="admission-actions"><select aria-label="Transfer destination bed" value={transferTargets[a._id]||''} onChange={e=>setTransferTargets({...transferTargets,[a._id]:e.target.value})}><option value="">Transfer to available bed</option>{beds.filter(b=>b.facilityId===a.facilityId._id).map(b=><option key={b._id} value={b._id}>{b.label}{b.wardId?.name ? ` · ${b.wardId.name}` : ''}</option>)}</select><button className="signout-button" disabled={busy||!transferTargets[a._id]} onClick={()=>void transfer(a._id)}>Transfer</button><button className="signout-button danger-button" disabled={busy} onClick={()=>void discharge(a._id)}>Discharge</button></div>
        </article>)}
      </div>
    </div>
  </section>;
}
