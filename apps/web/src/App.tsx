const foundationItems = [
  { label: 'Web application', detail: 'React, TypeScript and Vite', status: 'Ready' },
  { label: 'API foundation', detail: 'Express, TypeScript and versioned routes', status: 'Ready' },
  { label: 'Data connection', detail: 'MongoDB / Mongoose configuration', status: 'Configured' },
  { label: 'Operational modules', detail: 'Introduced in upcoming milestones', status: 'Planned' },
];
export default function App() {
  return <main className="shell">
    <nav className="topbar" aria-label="Main navigation"><a className="brand" href="/" aria-label="WardPilot home"><span className="brand-mark">W</span><span>wardpilot</span></a><span className="environment"><i /> Foundation workspace</span></nav>
    <section className="hero"><div className="eyebrow"><span /> HOSPITAL OPERATIONS INTELLIGENCE</div><h1>Clarity for complex<br /><em>hospital operations.</em></h1><p className="intro">A connected foundation for teams coordinating hospital capacity, resources and patient flow. Built in milestones, with operational capabilities added only when they are ready.</p><div className="hero-actions"><a className="primary-link" href="#foundation">Explore the foundation <span>↗</span></a><span className="version">WARDPILOT / 0.1.0</span></div></section>
    <section className="foundation" id="foundation"><div className="section-heading"><div><span className="kicker">PROJECT FOUNDATION</span><h2>Built to grow with the hospital.</h2></div><span className="milestone">MILESTONE 01</span></div><div className="status-grid">{foundationItems.map((item, index) => <article className="status-card" key={item.label}><div className="card-top"><span className="index">0{index + 1}</span><span className={item.status === 'Planned' ? 'status planned' : 'status'}>{item.status}</span></div><h3>{item.label}</h3><p>{item.detail}</p></article>)}</div></section>
    <footer><span>WARDPILOT</span><span>Smarter hospital operations. Better resource utilization. Connected care.</span></footer>
  </main>;
}
