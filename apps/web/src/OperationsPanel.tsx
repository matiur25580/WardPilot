import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Facility = { _id: string; name: string; code: string };
type Member = { user: { id: string; firstName: string; lastName: string; email: string; status: string }; role: string; status: string };
type Shift = { _id: string; userId: { firstName: string; lastName: string; email: string } | string; facilityId: { name: string; code: string } | string; shiftType: string; roleLabel: string; startAt: string; endAt: string; status: string };
type Item = { _id: string; itemCode: string; name: string; category: string; unit: string; onHand: number; reorderPoint: number; parLevel: number; facilityId: { name: string; code: string } | string };
const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';
async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } });
  const body = await response.json() as { success: boolean; data?: T; error?: { message: string } };
  if (!response.ok || !body.success || body.data === undefined) throw new Error(body.error?.message || 'Request failed.');
  return body.data;
}
const localDate = (value: string) => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function OperationsPanel({ accessToken, facilities, role }: { accessToken: string; facilities: Facility[]; role: string }) {
  const canManage = ['owner', 'admin', 'manager'].includes(role);
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [shiftForm, setShiftForm] = useState({ facilityId: '', userId: '', shiftType: 'day', roleLabel: '', startAt: '', endAt: '' });
  const [itemForm, setItemForm] = useState({ facilityId: '', itemCode: '', name: '', category: 'medical_supply', unit: 'units' , reorderPoint: '5', parLevel: '20' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [shiftRows, inventoryRows] = await Promise.all([
      request<Shift[]>('/operations/shifts', accessToken),
      request<Item[]>('/operations/inventory', accessToken)
    ]);
    setShifts(shiftRows); setItems(inventoryRows);
    if (canManage) {
      const people = await request<Member[]>('/organizations/members', accessToken);
      setMembers(people.filter(member => member.status === 'active' && member.user.status === 'active' && member.role !== 'viewer'));
    }
  }, [accessToken, canManage]);
  useEffect(() => { void refresh().catch(e => setError(e instanceof Error ? e.message : 'Unable to load operations data.')); }, [refresh]);

  async function createShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('/operations/shifts', accessToken, { method: 'POST', body: JSON.stringify({ ...shiftForm, startAt: new Date(shiftForm.startAt).toISOString(), endAt: new Date(shiftForm.endAt).toISOString() }) });
      setNotice('Staff shift scheduled. Overlapping assignments are rejected.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to schedule shift.'); }
    finally { setBusy(false); }
  }
  async function shiftAction(shift: Shift, status: 'confirmed' | 'completed' | 'cancelled') {
    setBusy(true); setError(''); setNotice('');
    try { await request('/operations/shifts/' + shift._id + '/status', accessToken, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice('Shift status updated.'); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to update shift.'); }
    finally { setBusy(false); }
  }
  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await request('/operations/inventory', accessToken, { method: 'POST', body: JSON.stringify({ ...itemForm, reorderPoint: Number(itemForm.reorderPoint), parLevel: Number(itemForm.parLevel) }) });
      setNotice('Inventory item registered.'); setItemForm({ facilityId: '', itemCode: '', name: '', category: 'medical_supply', unit: 'units', reorderPoint: '5', parLevel: '20' }); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create inventory item.'); }
    finally { setBusy(false); }
  }
  async function moveStock(item: Item, type: 'receive' | 'consume') {
    const raw = window.prompt(type === 'receive' ? 'Quantity received:' : 'Quantity consumed:');
    if (raw === null) return;
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { setError('Enter a positive whole-number quantity.'); return; }
    const reason = window.prompt('Reason / reference for this stock movement:');
    if (!reason || reason.trim().length < 5) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await request('/operations/inventory/' + item._id + '/movements', accessToken, {
        method: 'POST',
        body: JSON.stringify({ type, quantityChange: type === 'receive' ? quantity : -quantity, reason: reason.trim(), idempotencyKey: crypto.randomUUID() })
      });
      setNotice('Stock ledger updated.'); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to record stock movement.'); }
    finally { setBusy(false); }
  }

  return <section className="operations-panel">
    <div className="panel-heading"><div><span className="kicker">MILESTONE 05 / WORKFORCE & SUPPLY</span><h2>Staffing & critical inventory</h2></div><span className="count-pill">{shifts.length} shifts · {items.length} items</span></div>
    <p className="flow-intro">Coordinate staff coverage and essential supplies using tenant-scoped schedules and an auditable stock movement ledger. This module does not provide clinical advice or medication administration.</p>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="operations-notice" role="status">{notice}</p>}
    <div className="operations-grid">
      <section className="facility-panel">
        <div className="panel-heading"><div><span className="kicker">SHIFT ROSTER</span><h2>Upcoming assignments</h2></div><span className="count-pill">{shifts.filter(s=>['scheduled','confirmed'].includes(s.status)).length} planned</span></div>
        {shifts.length===0?<div className="empty-state"><strong>No shifts scheduled</strong><p>Create staff assignments to coordinate day, evening, night and on-call coverage.</p></div>:<div className="operations-list">{shifts.map(shift=><article className="operations-row" key={shift._id}><div><strong>{typeof shift.userId==='string'?'Staff member':shift.userId.firstName+' '+shift.userId.lastName}</strong><span>{shift.roleLabel||shift.shiftType.replace('_',' ')} · {typeof shift.facilityId==='string'?'Facility':shift.facilityId.name}</span><small>{localDate(shift.startAt)} – {localDate(shift.endAt)}</small></div><div className="operations-row-actions"><span className={'operations-status '+shift.status}>{shift.status}</span>{canManage&&shift.status==='scheduled'&&<button disabled={busy} onClick={()=>void shiftAction(shift,'confirmed')}>Confirm</button>}{canManage&&shift.status==='confirmed'&&<><button disabled={busy} onClick={()=>void shiftAction(shift,'completed')}>Complete</button><button disabled={busy} onClick={()=>void shiftAction(shift,'cancelled')}>Cancel</button></>}</div></article>)}</div>}
      </section>
      {canManage&&<form className="create-panel operations-form" onSubmit={createShift}><span className="kicker">WORKFORCE PLANNING</span><h3>Schedule a staff shift</h3>
        <label>Facility<select required value={shiftForm.facilityId} onChange={e=>setShiftForm({...shiftForm,facilityId:e.target.value})}><option value="">Select facility</option>{facilities.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>
        <label>Staff member<select required value={shiftForm.userId} onChange={e=>setShiftForm({...shiftForm,userId:e.target.value})}><option value="">Select member</option>{members.map(m=><option key={m.user.id} value={m.user.id}>{m.user.firstName} {m.user.lastName} · {m.role}</option>)}</select></label>
        <label>Shift type<select value={shiftForm.shiftType} onChange={e=>setShiftForm({...shiftForm,shiftType:e.target.value})}><option value="day">Day</option><option value="evening">Evening</option><option value="night">Night</option><option value="on_call">On-call</option></select></label>
        <label>Role / assignment<input value={shiftForm.roleLabel} onChange={e=>setShiftForm({...shiftForm,roleLabel:e.target.value})} maxLength={100} placeholder="e.g. ICU nursing cover"/></label>
        <div className="field-row"><label>Start<input type="datetime-local" required value={shiftForm.startAt} onChange={e=>setShiftForm({...shiftForm,startAt:e.target.value})}/></label><label>End<input type="datetime-local" required value={shiftForm.endAt} onChange={e=>setShiftForm({...shiftForm,endAt:e.target.value})}/></label></div>
        <button className="primary-button full-button" disabled={busy||!facilities.length||!members.length}>Schedule shift</button>
      </form>}
    </div>
    <div className="panel-heading operations-inventory-heading"><div><span className="kicker">SUPPLY READINESS</span><h2>Critical inventory</h2></div><span className="count-pill">{items.filter(i=>i.onHand<=i.reorderPoint).length} at reorder point</span></div>
    <div className="operations-grid">
      <section className="facility-panel"><div className="panel-heading"><h2>Stock register</h2><button className="text-button" onClick={()=>void refresh()}>Refresh</button></div>
        {items.length===0?<div className="empty-state"><strong>No inventory items</strong><p>Register essential supplies and set reorder thresholds.</p></div>:<div className="operations-list">{items.map(item=><article className="operations-row" key={item._id}><div><strong>{item.name}</strong><span>{item.itemCode} · {item.category.replaceAll('_',' ')}</span><small>{item.onHand} {item.unit} on hand · reorder at {item.reorderPoint} · par {item.parLevel}</small></div><div className="operations-row-actions"><span className={'operations-status '+(item.onHand<=item.reorderPoint?'low-stock':'in-stock')}>{item.onHand<=item.reorderPoint?'Reorder':'In stock'}</span><button disabled={busy} onClick={()=>void moveStock(item,'receive')}>Receive</button><button disabled={busy||item.onHand===0} onClick={()=>void moveStock(item,'consume')}>Consume</button></div></article>)}</div>}
      </section>
      {canManage&&<form className="create-panel operations-form" onSubmit={createItem}><span className="kicker">INVENTORY MASTER DATA</span><h3>Register a supply item</h3>
        <label>Facility<select required value={itemForm.facilityId} onChange={e=>setItemForm({...itemForm,facilityId:e.target.value})}><option value="">Select facility</option>{facilities.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>
        <label>Item code<input required minLength={2} maxLength={40} value={itemForm.itemCode} onChange={e=>setItemForm({...itemForm,itemCode:e.target.value})} placeholder="PPE-GLOVE-M"/></label>
        <label>Item name<input required minLength={2} maxLength={160} value={itemForm.name} onChange={e=>setItemForm({...itemForm,name:e.target.value})} placeholder="Disposable examination gloves"/></label>
        <label>Category<select value={itemForm.category} onChange={e=>setItemForm({...itemForm,category:e.target.value})}><option value="medical_supply">Medical supply</option><option value="ppe">PPE</option><option value="consumable">Consumable</option><option value="equipment">Equipment</option><option value="pharmacy_stock">Pharmacy stock</option><option value="other">Other</option></select></label>
        <label>Unit<input required value={itemForm.unit} onChange={e=>setItemForm({...itemForm,unit:e.target.value})}/></label>
        <div className="field-row"><label>Reorder point<input type="number" min="0" step="1" value={itemForm.reorderPoint} onChange={e=>setItemForm({...itemForm,reorderPoint:e.target.value})}/></label><label>Par level<input type="number" min="0" step="1" value={itemForm.parLevel} onChange={e=>setItemForm({...itemForm,parLevel:e.target.value})}/></label></div>
        <button className="primary-button full-button" disabled={busy||!facilities.length}>Add inventory item</button>
      </form>}
    </div>
  </section>;
}
