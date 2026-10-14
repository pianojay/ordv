import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ReactFlow, Background, Controls, Handle, Position, getNodesBounds, getViewportForBounds, useReactFlow, useStore, useStoreApi, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './style.css';
import { flatten, validatePlan, suggestedTree, type Plan, type ReadingNode } from '../core/model';
import { allNodes, excludeDocument, moveNode, reorder } from '../core/tree';
import { diagnostics } from '../core/diagnostics';

const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('packet-token') || '';
sessionStorage.setItem('packet-token', token);
history.replaceState(null, '', location.pathname);
async function api(route: string, value?: unknown) {
  const response = await fetch(`/api/${route}`, { method: value === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-packet-token': token }, body: value === undefined ? undefined : JSON.stringify(value) });
  if (!response.ok) { const error = await response.json(); throw new Error(error.error || 'Request failed'); }
  return response;
}
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function PacketNode({ data }: NodeProps) {
  const d = data as any;
  return <div className={`packet-node ${d.included ? 'included' : ''} ${d.head ? 'head' : ''} ${d.available ? '' : 'unavailable'}`}>
    <Handle type="target" position={Position.Left}/>
    <div className="node-meta">{d.head ? 'HEAD DOCUMENT' : d.included ? `READING ORDER ${d.order}` : d.available ? 'CANDIDATE' : 'UNAVAILABLE'}</div>
    <div className="node-title">{d.title}</div>
    <div className="node-bottom"><span>{d.remote ? 'REMOTE' : 'LOCAL'} · {d.linkCount} links</span><button className="nodrag node-select" disabled={!d.available} aria-label={`${d.included ? 'Exclude' : 'Include'} ${d.title}`} onClick={e => { e.stopPropagation(); d.toggle(); }}>{d.included ? '✓' : '+'}</button></div>
    <Handle type="source" position={Position.Right}/>
  </div>;
}
const nodeTypes = { document: PacketNode };
function FitGraph({ revision }: { revision: string }) {
  const { setViewport } = useReactFlow(), store = useStoreApi();
  const ready = useStore(s => s.nodeLookup.size > 0 && [...s.nodeLookup.values()].every(n => !!n.measured.width && !!n.measured.height));
  const width = useStore(s => s.width), height = useStore(s => s.height);
  const measuredLayout = useStore(s => [...s.nodeLookup.values()].map(n => `${n.id}:${n.internals.positionAbsolute.x}:${n.internals.positionAbsolute.y}:${n.measured.width}:${n.measured.height}`).join('|'));
  useEffect(() => {
    if (!ready || !width || !height) return;
    // fitView queues a node update, which a read-only controlled graph does not
    // apply. Set the measured viewport directly instead.
    const frame = requestAnimationFrame(() => { void setViewport(getViewportForBounds(getNodesBounds([...store.getState().nodeLookup.values()]), width, height, 0.1, 1.2, 0.15), { duration: 0 }); });
    return () => cancelAnimationFrame(frame);
  }, [ready, revision, measuredLayout, width, height, store, setViewport]);
  return null;
}
function App() {
  const [plan, setPlan] = useState<Plan | null>(null), [input, setInput] = useState(''), [busy, setBusy] = useState(''), [error, setError] = useState(''), [tab, setTab] = useState<'graph' | 'preview'>('graph'), [preview, setPreview] = useState(''), [previewWarnings, setPreviewWarnings] = useState<string[]>([]), [focus, setFocus] = useState(''), [section, setSection] = useState(''), [previewError, setPreviewError] = useState('');
  useEffect(() => { api('plan').then(r => r.json()).then(p => { if (p) { setPlan(validatePlan(p)); setInput(p.input); } }).catch(e => setError(e.message)); }, []);
  const selected = plan ? flatten(plan.tree) : [], selectedSet = new Set(selected);
  function change(fn: (p: Plan) => void) { if (!plan) return; try { const next = structuredClone(plan); fn(next); setPlan(next); setError(''); } catch (e: any) { setError(e.message); } }
  function toggle(id: string) { change(p => { if (flatten(p.tree).includes(id)) p.tree = excludeDocument(p.tree, id); else { const d = p.documents.find(d => d.id === id)!; p.tree.push({ id: `node-${id}`, title: d.title, documentId: id, children: [] }); } }); }
  async function run(label: string, work: () => Promise<void>) { setBusy(label); setError(''); try { await work(); } catch (e: any) { setError(e.message); } finally { setBusy(''); } }
  async function discover(refresh = false) { await run(refresh ? 'Refreshing sources…' : 'Discovering documents…', async () => { const p = await (await api('discover', { input, refresh })).json(); setPlan(p); setFocus(p.head); }); }
  useEffect(() => {
    if (tab !== 'preview' || !plan || !flatten(plan.tree).length) return;
    let active = true;
    const timer = setTimeout(() => {
      setPreview(''); setPreviewError('');
      api('preview', plan).then(r => r.json()).then(r => { if (active) { setPreview(r.html); setPreviewWarnings(r.warnings); } }).catch(e => { if (active) setPreviewError(e.message); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [plan, tab]);
  const graph = useMemo(() => {
    if (!plan) return { nodes: [], edges: [] };
    const included = flatten(plan.tree), positions = new Map<string, { x: number; y: number }>(), treeEdges = new Set<string>();
    let row = 0;
    function visit(nodes: ReadingNode[], depth: number, parent?: string) {
      for (const n of nodes) { if (n.documentId) { positions.set(n.documentId, { x: depth * 280, y: row++ * 130 }); if (parent) treeEdges.add(`${parent}:${n.documentId}`); } visit(n.children, depth + 1, n.documentId || parent); }
    }
    visit(plan.tree, 0);
    const maxX = Math.max(0, ...[...positions.values()].map(p => p.x)); let other = 0;
    const nodes = plan.documents.map(d => ({ id: d.id, type: 'document', position: positions.get(d.id) || { x: maxX + 320, y: other++ * 130 }, data: { title: d.title, included: included.includes(d.id), available: d.available, order: included.indexOf(d.id) + 1, head: d.id === plan.head, remote: /^https?:/.test(d.source), linkCount: d.links.length, toggle: () => toggle(d.id) } }));
    const ids = new Set(plan.documents.map(d => d.id));
    const edges = plan.documents.flatMap(d => d.links.filter(l => l.kind === 'markdown' && l.target && ids.has(l.target)).map((l, i) => ({ id: `${d.id}-${i}`, source: d.id, target: l.target!, style: { stroke: treeEdges.has(`${d.id}:${l.target}`) ? '#238f83' : '#b59d74', strokeWidth: 1.6, strokeDasharray: treeEdges.has(`${d.id}:${l.target}`) ? undefined : '5 5' } })));
    return { nodes, edges };
  }, [plan]);
  const focused = plan?.documents.find(d => d.id === focus);
  const warnings = plan ? diagnostics(plan) : [];
  function renderTree(nodes: ReadingNode[], depth = 0, parent?: string): React.ReactNode {
    return nodes.map(n => <React.Fragment key={n.id}><div className={`tree-row ${n.documentId ? '' : 'section-row'}`} style={{ paddingLeft: 12 + depth * 13 }} draggable onDragStart={e => e.dataTransfer.setData('text/plain', n.id)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); try { change(p => { p.tree = moveNode(p.tree, id, parent, n.id); }); } catch (e: any) { setError(e.message); } }}>
      <div className="tree-top"><span className="order-badge">{n.documentId ? selected.indexOf(n.documentId) + 1 : '§'}</span><input aria-label={n.documentId ? 'Document title' : 'Section title'} value={n.title} onChange={e => change(p => { allNodes(p.tree).find(x => x.id === n.id)!.title = e.target.value; })}/><button className="quiet" title="Exclude document or remove section" onClick={() => change(p => { p.tree = n.documentId ? excludeDocument(p.tree, n.documentId) : p.tree.flatMap(function remove(x): ReadingNode[] { return x.id === n.id ? x.children : [{ ...x, children: x.children.flatMap(remove) }]; }); })}>×</button></div>
      <div className="tree-controls"><button className="quiet" title="Move up" onClick={() => change(p => { p.tree = reorder(p.tree, n.id, -1); })}>↑</button><button className="quiet" title="Move down" onClick={() => change(p => { p.tree = reorder(p.tree, n.id, 1); })}>↓</button><select aria-label={`Parent of ${n.title}`} value={parent || ''} onChange={e => { try { change(p => { p.tree = moveNode(p.tree, n.id, e.target.value || undefined); }); } catch (err: any) { setError(err.message); } }}><option value="">Top level</option>{allNodes(plan!.tree).filter(x => x.id !== n.id && !allNodes(n.children).some(c => c.id === x.id)).map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></div>
    </div>{renderTree(n.children, depth + 1, n.id)}</React.Fragment>);
  }
  return <div className="app-shell">
    <header><div className="brand"><span className="brand-icon">R<span>↗</span></span><div><strong>ordv</strong><small>FROM LINKED NOTES TO A PRINTED STORY</small></div></div><div className="header-actions"><label className="button secondary">Load plan<input type="file" accept=".json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) run('Loading plan…', async () => { const p = validatePlan(JSON.parse(await f.text())); setPlan(p); setInput(p.input); }); e.target.value = ''; }}/></label><button className="secondary" disabled={!plan || !!busy} onClick={() => download(new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' }), 'reading-plan.json')}>Save plan</button><button className="primary" disabled={!selected.length || !!busy} onClick={() => run('Rendering PDF…', async () => { const result = await api('export', plan); download(await result.blob(), `reading-packet-${plan!.settings.mode}.pdf`); })}>Export PDF <span>↗</span></button></div></header>
    <div className="source-bar"><span className="step">01 / SOURCE</span><input aria-label="Source path or URL" placeholder="D:\\notes, a README.md, or a public raw Markdown URL" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') discover(); }}/><button className="primary" disabled={!input.trim() || !!busy} onClick={() => discover()}>Discover</button><button className="secondary" disabled={!plan || !!busy} title="Read source files again and refresh remote cache; resets reading order" onClick={() => discover(true)}>Refresh</button></div>
    {(error || busy) && <div className={`status ${error ? 'error' : ''}`} role="status">{error || busy}</div>}
    <main><aside className="reading-sidebar"><div className="panel-heading"><span className="step">02 / READING ORDER</span><span className="pill">{selected.length} selected</span></div>
      {plan ? <><div className="head-control"><label>STARTING DOCUMENT</label><select aria-label="Head document" value={plan.head} onChange={e => change(p => { p.head = e.target.value; p.tree = suggestedTree(p.documents, p.head); })}>{plan.candidates.map(c => <option key={c.id} value={c.id}>{c.title} · reaches {c.reachable}</option>)}</select><small>Suggested from README, incoming links, and coverage. Changing the head resets the reading tree.</small></div>
      <div className="tree-list">{renderTree(plan.tree)}{!selected.length && <p className="empty-small">Choose documents using + in the graph.</p>}</div>
      <div className="add-section"><input aria-label="New section name" placeholder="New section name" value={section} onChange={e => setSection(e.target.value)}/><button className="secondary" disabled={!section.trim()} onClick={() => { change(p => p.tree.push({ id: crypto.randomUUID(), title: section.trim(), children: [] })); setSection(''); }}>+</button></div>
      <div className="export-options"><span className="step">03 / PRINT SETTINGS</span><label>PDF mode<select aria-label="PDF mode" value={plan.settings.mode} onChange={e => change(p => { p.settings.mode = e.target.value as any; })}><option value="book">Unified book</option><option value="documents">Per-document packet</option></select></label><label>Paper<select aria-label="Paper size" value={plan.settings.paper} onChange={e => change(p => { p.settings.paper = e.target.value as any; })}><option>A4</option><option>Letter</option></select></label>{(['toc', 'graph', 'math'] as const).map(key => <label className="checkbox" key={key}><input type="checkbox" checked={plan.settings[key]} onChange={e => change(p => { p.settings[key] = e.target.checked; })}/>{({ toc: 'Tree table of contents', graph: 'Print relationship graph (up to 30 documents)', math: 'Render math formulas' })[key]}</label>)}{plan.settings.mode === 'documents' && focused && <div className="document-style"><small>Style for {focused.title}</small><label>Font size<input aria-label="Document font size" type="number" min="8" max="24" value={plan.settings.documentStyles[focused.id]?.fontSize ?? 11} onChange={e => change(p => { p.settings.documentStyles[focused.id] = { ...(p.settings.documentStyles[focused.id] || { marginMm: 18, fontSize: 11 }), fontSize: Math.min(24, Math.max(8, Number(e.target.value))) }; })}/></label><label>Margin (mm)<input aria-label="Document margin" type="number" min="5" max="40" value={plan.settings.documentStyles[focused.id]?.marginMm ?? 18} onChange={e => change(p => { p.settings.documentStyles[focused.id] = { ...(p.settings.documentStyles[focused.id] || { marginMm: 18, fontSize: 11 }), marginMm: Math.min(40, Math.max(5, Number(e.target.value))) }; })}/></label></div>}</div>
      <div className="snapshot-note">Snapshot saved {new Date(plan.createdAt).toLocaleString()}<br/>Preview and export use these captured sources.</div></> : <div className="sidebar-empty"><span>↗</span><p>Start with a head document.<br/>We’ll follow its links and suggest a reading tree.</p></div>}
    </aside><section className="workspace"><div className="workspace-bar"><nav><button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>Document graph</button><button className={tab === 'preview' ? 'active' : ''} disabled={!selected.length} onClick={() => setTab('preview')}>Print preview</button></nav><span>{plan ? `${plan.documents.length} discovered · ${plan.documents.filter(d => !selectedSet.has(d.id)).length} outside packet` : 'LOCAL WORKSPACE'}</span></div>
      {!plan ? <div className="welcome"><div className="welcome-diagram"><span>README</span><i>↘</i><span>Notes</span><i>↗</i><span>Sources</span></div><span className="eyebrow">A READING ORDER, NOT JUST A FILE LIST</span><h1>Follow the links.<br/>Shape the story.</h1><p>Discover your Markdown graph, choose what belongs,<br/>and turn it into a packet worth reading on paper.</p><div className="welcome-features"><span>01 Discover</span><span>02 Arrange</span><span>03 Print</span></div></div> : tab === 'graph' ? <div className="graph-container"><ReactFlow key={plan.createdAt} nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} onNodeClick={(_, n) => setFocus(n.id)} fitView minZoom={0.1} maxZoom={1.8} nodesConnectable={false}><FitGraph revision={graph.nodes.map(n => `${n.id}:${n.position.x}:${n.position.y}`).join("|")}/><Background color="#d9e2df" gap={24}/><Controls showInteractive={false}/></ReactFlow><div className="graph-legend"><span><i className="solid"/>Reading tree</span><span><i className="dashed"/>Cross-link</span><span>Use + / ✓ to select</span></div></div> : <div className="preview-container">{previewError ? <p className="error">{previewError}</p> : preview ? <iframe title="Packet print preview" sandbox="allow-scripts" srcDoc={preview}/> : <div className="preview-loading">Preparing snapshot preview…</div>}<p className="preview-caption">Content preview; final pagination is applied on PDF export. Per-document mode renders each document separately.</p></div>}
      {focused && tab === 'graph' && <div className="inspector"><div><strong>{focused.title}</strong><small>{focused.source}</small></div><div className="reference-list">{focused.links.filter(l => l.kind !== 'markdown' && l.kind !== 'anchor').map((l, i) => <span key={i} title={l.href}>{l.kind === 'pdf' ? 'PDF SOURCE' : 'REFERENCE'} · {l.label || l.href}</span>)}{!focused.links.length && <span>No outgoing links</span>}</div></div>}
      {!!(warnings.length || tab === 'preview' && previewWarnings.length) && <details className="warnings"><summary>{(tab === 'preview' ? previewWarnings : warnings).length} source / reference notices</summary><ul>{(tab === 'preview' ? previewWarnings : warnings).map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
    </section></main><footer><span>ordv · Local only</span><span>PDF sources stay references · Original files stay untouched</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
