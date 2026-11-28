import { useEffect, useState } from 'react';

type Facility = { _id: string; name: string; code: string };
type Overview = {
  generatedAt: string;
  window: { from: string; to: string; days: number };
  capacity: { beds: Record<'available' | 'reserved' | 'occupied' | 'cleaning' | 'maintenance', number>; total: number; occupancyRate: number; availableRate: number };
  patientFlow: { activeAdmissions: number; admissionsInWindow: number; dischargesInWindow: number; averageLengthOfStayHours: number | null };
  workforce: { shifts: Record<'scheduled' | 'confirmed' | 'completed' | 'cancelled', number>; uniqueStaffScheduled: number };
  inventory: { activeItems: number; lowStockItems: number; outOfStockItems: number };
  alerts: Array<{ code: string; severity: 'critical' | 'warning' | 'info'; message: string }>;
  privacy: { patientIdentifiableInformationIncluded: false };
};

export default function OperationalIntelligencePanel({ accessToken, facilities }: { accessToken: string; facilities: Facility[] }) {
  const [facilityId, setFacilityId] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError('');
      try {
        const query = facilityId ? `?facilityId=${encodeURIComponent(facilityId)}` : '';
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api/v1'}/intelligence/overview${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` }, signal: controller.signal,
        });
        const payload = await response.json() as { success: boolean; data?: Overview; error?: { message?: string } };
        if (!response.ok || !payload.success || !payload.data) throw new Error(payload.error?.message || 'Unable to load operational intelligence.');
        if (active) setOverview(payload.data);
      } catch (caught) {
        if (active && !(caught instanceof DOMException && caught.name === 'AbortError')) setError(caught instanceof Error ? caught.message : 'Unable to load operational intelligence.');
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [accessToken, facilityId]);

  const capacity = overview?.capacity;
  return <section className="intelligence-panel">
    <div className="panel-heading intelligence-heading">
      <div><span className="kicker">OPERATIONAL INTELLIGENCE / MILESTONE 06</span><h2>Capacity &amp; operations overview</h2><p>Descriptive metrics from current, tenant-scoped operational records</p></div>
      <label className="intelligence-filter">Facility
        <select value={facilityId} onChange={(event) => setFacilityId(event.target.value)}>
          <option value="">All facilities</option>
          {facilities.map((facility) => <option key={facility._id} value={facility._id}>{facility.name}</option>)}
        </select>
      </label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && !overview ? <p className="intelligence-muted">Calculating operational summary…</p> : overview ? <>
      <div className="intelligence-metrics">
        <article><span>BED OCCUPANCY</span><strong>{capacity?.occupancyRate}%</strong><small>{capacity?.beds.occupied} occupied of {capacity?.total} registered beds</small></article>
        <article><span>ACTIVE ADMISSIONS</span><strong>{overview.patientFlow.activeAdmissions}</strong><small>{overview.patientFlow.admissionsInWindow} admissions in reporting window</small></article>
        <article><span>STAFF COVERAGE</span><strong>{overview.workforce.uniqueStaffScheduled}</strong><small>Unique staff with shifts in window</small></article>
        <article><span>LOW / OUT OF STOCK</span><strong>{overview.inventory.lowStockItems} / {overview.inventory.outOfStockItems}</strong><small>Of {overview.inventory.activeItems} active items</small></article>
      </div>
      <div className="intelligence-detail-grid">
        <article className="intelligence-detail"><h3>Bed status distribution</h3>{Object.entries(capacity?.beds || {}).map(([status, count]) => <div className="intelligence-bar-row" key={status}><span>{status}</span><div className="intelligence-bar"><i style={{ width: `${capacity?.total ? (Number(count) / capacity.total) * 100 : 0}%` }} /></div><b>{count}</b></div>)}</article>
        <article className="intelligence-detail"><h3>Patient flow · reporting window</h3><div className="intelligence-pair"><span>Admissions<strong>{overview.patientFlow.admissionsInWindow}</strong></span><span>Discharges<strong>{overview.patientFlow.dischargesInWindow}</strong></span></div><p>Average length of stay: <strong>{overview.patientFlow.averageLengthOfStayHours === null ? 'Not available' : `${overview.patientFlow.averageLengthOfStayHours} hours`}</strong></p><p>Shifts scheduled / confirmed: <strong>{overview.workforce.shifts.scheduled} / {overview.workforce.shifts.confirmed}</strong></p></article>
      </div>
      <div className="intelligence-alerts"><h3>Operational signals</h3>{overview.alerts.length ? overview.alerts.map((alert) => <p className={`intelligence-alert ${alert.severity}`} key={alert.code}><strong>{alert.severity}</strong>{alert.message}</p>) : <p className="intelligence-muted">No threshold-based signals for this reporting scope.</p>}</div>
      <p className="intelligence-footnote">Reporting window: {new Date(overview.window.from).toLocaleDateString()} – {new Date(overview.window.to).toLocaleDateString()} · Generated {new Date(overview.generatedAt).toLocaleTimeString()}. Metrics are descriptive, not forecasts or clinical recommendations.</p>
    </> : !error ? <p className="intelligence-muted">No operational data is available yet.</p> : null}
  </section>;
}
