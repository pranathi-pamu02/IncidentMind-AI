"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, ArrowDownRight, ArrowUpRight, BookOpen,
  Check, ChevronDown, ChevronRight, Clock3, Download, FileClock, FileText,
  Filter, Gauge, LayoutDashboard, LogOut, Menu, MessageSquare, Plus, Search,
  Send, Settings, ShieldCheck, Siren, Users, X,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
type Severity = "critical" | "high" | "medium" | "low";
type Incident = {
  id: number; title: string; description: string; severity: Severity; service_name: string;
  status: string; created_at: string; updated_at?: string; root_cause?: string | null;
  resolution?: string | null; engineer_notes?: string; failed_attempts: string[];
  tags: string[]; logs: string; timeline?: { id: number; event_type: string; message: string; created_at: string }[];
};
type Dashboard = {
  total_incidents: number; open_incidents: number; resolved_incidents: number;
  resolution_rate: number; severity: Record<string, number>; statuses: Record<string, number>;
  recent: Incident[]; services: { name: string; count: number }[];
};
type Postmortem = Record<string, string> & { generated_at: string };

const severityClass = (value?: string) => `severity severity-${(value || "unknown").toLowerCase()}`;
const statusClass = (value?: string) => `status status-${(value || "open").toLowerCase()}`;
const dateTime = (value?: string) => value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const shortDate = (value?: string) => value ? new Date(value).toLocaleDateString([], { month: "short", day: "numeric" }) : "—";
const monthKey = (value: string) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString([], { month: "short" });
const titleCase = (value?: string) => (value || "unknown").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const errorMessage = (body: unknown, fallback: string) => {
  if (!body || typeof body !== "object" || !("detail" in body)) return fallback;
  const { detail } = body;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map(item => {
      if (!item || typeof item !== "object") return String(item);
      const issue = item as { loc?: unknown[]; msg?: unknown };
      const location = Array.isArray(issue.loc) ? issue.loc.filter(part => part !== "body").join(".") : "";
      const message = typeof issue.msg === "string" ? issue.msg : "Invalid value";
      return location ? `${location}: ${message}` : message;
    }).join("; ");
  }
  return fallback;
};

export default function Home() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [path, setPath] = useState("/dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState("");
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [auth, setAuth] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null);
  const [postmortemLoading, setPostmortemLoading] = useState(false);

  const api = useCallback(async (url: string, options: RequestInit = {}) => {
    const response = await fetch(API + url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({}));
      throw new Error(errorMessage(body, `Request failed (${response.status})`));
    }
    return response.status === 204 ? null : response.json();
  }, [token]);

  const navigate = (destination: string) => {
    history.pushState({}, "", destination);
    setPath(destination);
    if (!destination.startsWith("/chat")) setSelected(null);
    setAnalysis(null);
    setPostmortem(null);
    setMobileNav(false);
    setError("");
  };

  useEffect(() => {
    setToken(localStorage.getItem("im_token") || "");
    setUser(JSON.parse(localStorage.getItem("im_user") || "null"));
    setPath(location.pathname === "/" ? "/dashboard" : location.pathname);
    const handlePop = () => setPath(location.pathname === "/" ? "/dashboard" : location.pathname);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  useEffect(() => {
    if (!token) return;
    setLoadingPage(true);
    Promise.all([api("/dashboard"), api("/incidents?limit=100")])
      .then(([dash, rows]) => { setDashboard(dash); setIncidents(rows); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoadingPage(false));
  }, [token, path, api]);

  useEffect(() => {
    if (!token || !path.startsWith("/incidents/") || path === "/incidents/new") return;
    const id = Number(path.split("/")[2]);
    if (!Number.isFinite(id)) return;
    setSelected(null);
    api(`/incidents/${id}`)
      .then((incident: Incident) => {
        setSelected(incident);
        const saved = localStorage.getItem(`im_postmortem_${id}`);
        setPostmortem(saved ? JSON.parse(saved) : null);
        return api(`/incidents/${id}/analyze`, { method: "POST" });
      })
      .then(setAnalysis)
      .catch((e: Error) => setError(e.message));
  }, [token, path, api]);

  useEffect(() => {
    if (token && path === "/chat") api("/chat/history")
      .then((rows: any[]) => setMessages(rows.map(row => ({ role: row.role, content: row.content }))))
      .catch((e: Error) => setError(e.message));
  }, [token, path, api]);

  const signIn = async (event: FormEvent, register = false) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/auth/${register ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(errorMessage(body, "Authentication failed"));
      localStorage.setItem("im_token", body.access_token); localStorage.setItem("im_user", JSON.stringify(body.user));
      setToken(body.access_token); setUser(body.user); navigate("/dashboard");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const createIncident = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      title: form.get("title"), description: form.get("description"), severity: form.get("severity"),
      service_name: form.get("service_name"), logs: form.get("logs"),
      tags: String(form.get("tags") || "").split(",").map(tag => tag.trim()).filter(Boolean),
    };
    try { const created = await api("/incidents", { method: "POST", body: JSON.stringify(body) }); navigate(`/incidents/${created.id}`); setNotice("Incident created"); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const updateIncident = async (id: number, body: Record<string, unknown>) => {
    try {
      await api(`/incidents/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      const updated = await api(`/incidents/${id}`); setSelected(updated);
      const [dash, rows] = await Promise.all([api("/dashboard"), api("/incidents?limit=100")]);
      setDashboard(dash); setIncidents(rows); setNotice("Incident changes saved");
    } catch (e) { setError((e as Error).message); }
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault(); if (!chatText.trim()) return;
    const text = chatText.trim(); setChatText(""); setMessages(rows => [...rows, { role: "user", content: text }]);
    try {
      const result = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, incident_id: selected?.id || null }) });
      setMessages(rows => [...rows, { role: "assistant", content: result.answer, references: result.references }]);
    } catch (e) { setError((e as Error).message); }
  };

  const generatePostmortem = () => {
    if (!selected) return;
    setPostmortemLoading(true);
    const related = analysis?.similar_incidents || [];
    const now = new Date().toISOString();
    const doc: Postmortem = {
      generated_at: now,
      executive_summary: `${selected.title} affected ${selected.service_name} at ${titleCase(selected.severity)} severity. Current status: ${titleCase(selected.status)}. ${analysis?.summary || "No AI summary is available; review the incident record before sharing."}`,
      root_cause: selected.root_cause || analysis?.root_cause || "Root cause has not been confirmed. Update this section with validated findings.",
      impact: selected.description || "Impact details were not recorded. Add affected users, duration, and service-level impact.",
      timeline: (selected.timeline || []).length ? selected.timeline!.map(event => `${dateTime(event.created_at)} — ${titleCase(event.event_type)}: ${event.message}`).join("\n") : `Reported: ${dateTime(selected.created_at)}\nNo further timeline events are available in the incident record.`,
      resolution: selected.resolution || related.find((item: any) => item.resolution)?.resolution || "Resolution has not been recorded. Add the mitigation and how recovery was verified.",
      lessons_learned: [selected.engineer_notes, ...(selected.failed_attempts || []).map(item => `Avoid repeating: ${item}`)].filter(Boolean).join("\n") || "Capture what went well, what slowed response, and any failed troubleshooting attempts.",
      prevention_plan: related.length ? `Review actions from ${related.length} similar historical incident(s). Validate preventive controls for ${selected.service_name}, add or refine monitoring, and assign an owner and due date.` : `Review recent changes and service safeguards for ${selected.service_name}. Add an owner, due date, and measurable prevention check after the cause is confirmed.`,
    };
    window.setTimeout(() => {
      localStorage.setItem(`im_postmortem_${selected.id}`, JSON.stringify(doc));
      setPostmortem(doc); setPostmortemLoading(false); setNotice("Postmortem generated and saved on this device");
    }, 220);
  };

  const logout = () => { localStorage.removeItem("im_token"); localStorage.removeItem("im_user"); setToken(""); setUser(null); navigate("/login"); };
  const visibleIncidents = useMemo(() => incidents.filter(item => {
    const matchesText = !query || `${item.title} ${item.service_name} ${item.description} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase());
    return matchesText && (!severityFilter || item.severity === severityFilter) && (!statusFilter || item.status === statusFilter);
  }), [incidents, query, severityFilter, statusFilter]);

  if (!token) return <AuthScreen path={path} navigate={navigate} auth={auth} setAuth={setAuth} onSubmit={signIn} busy={busy} error={error} />;

  const currentRoute = path.startsWith("/incidents/") && path !== "/incidents/new" ? "Incident detail" : path.slice(1).replaceAll("-", " ");
  const navItems = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
    { href: "/incidents", label: "Incidents", icon: Siren },
    { href: "/history", label: "Incident memory", icon: BookOpen },
    { href: "/chat", label: "Response assistant", icon: MessageSquare },
    { href: "/executive-summary", label: "Executive summary", icon: Gauge },
  ];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-icon"><Activity size={19} /></span><span><b>IncidentMind</b><small>OPERATIONS</small></span><button className="mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={17} /></button></div>
      <button className="workspace-switch"><span className="workspace-avatar">N</span><span><b>Northstar Systems</b><small>Engineering workspace</small></span><ChevronDown size={15} /></button>
      <div className="side-label">WORKSPACE</div>
      <nav className="side-nav">{navItems.map(item => <button key={item.href} onClick={() => navigate(item.href)} className={path === item.href || (item.href === "/incidents" && path.startsWith("/incidents")) ? "selected" : ""}><item.icon size={17} /><span>{item.label}</span>{item.href === "/incidents" && dashboard?.open_incidents ? <em>{dashboard.open_incidents}</em> : null}</button>)}</nav>
      <div className="sidebar-bottom"><div className="connection-card"><div><span className="connection-dot" /> Services connected</div><small>Memory index · {incidents.length} incidents</small></div><button className="side-link" onClick={() => navigate("/history")}><Settings size={16} /> Workspace settings</button><div className="user-card"><span className="user-avatar">{user?.name?.[0] || "E"}</span><span className="user-meta"><b>{user?.name || "Engineer"}</b><small>{user?.email || ""}</small></span><button onClick={logout} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={19} /></button><div className="breadcrumbs"><span>Northstar Systems</span><ChevronRight size={14} /><b>{titleCase(currentRoute)}</b></div><div className="top-actions"><label className="global-search"><Search size={15} /><input placeholder="Search incidents" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label><span className="top-divider" /><span className="user-avatar small">{user?.name?.[0] || "E"}</span></div></header>
      {(error || notice) && <div className={`toast ${error ? "toast-error" : "toast-success"}`} role="status"><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15} /></button></div>}
      {path === "/dashboard" && <DashboardPage dashboard={dashboard} incidents={incidents} loading={loadingPage} navigate={navigate} />}
      {path === "/incidents" && <IncidentsPage incidents={visibleIncidents} allCount={incidents.length} loading={loadingPage} query={query} setQuery={setQuery} severity={severityFilter} setSeverity={setSeverityFilter} status={statusFilter} setStatus={setStatusFilter} navigate={navigate} />}
      {path === "/incidents/new" && <CreateIncidentPage onSubmit={createIncident} busy={busy} navigate={navigate} />}
      {path.startsWith("/incidents/") && path !== "/incidents/new" && <IncidentDetailPage incident={selected} analysis={analysis} postmortem={postmortem} postmortemLoading={postmortemLoading} busy={busy} generatePostmortem={generatePostmortem} updateIncident={updateIncident} navigate={navigate} />}
      {path === "/history" && <HistoryPage incidents={incidents} loading={loadingPage} navigate={navigate} />}
      {path === "/chat" && <ChatPage messages={messages} text={chatText} setText={setChatText} onSubmit={sendMessage} incidents={incidents} selected={selected} navigate={navigate} />}
      {path === "/executive-summary" && <ExecutivePage dashboard={dashboard} incidents={incidents} loading={loadingPage} navigate={navigate} />}
    </main>
  </div>;
}

function AuthScreen({ path, navigate, auth, setAuth, onSubmit, busy, error }: any) {
  const register = path === "/register";
  return <div className="auth-page"><section className="auth-card"><div className="brand auth-brand"><span className="brand-icon"><Activity size={19} /></span><span><b>IncidentMind</b><small>OPERATIONS</small></span></div><div className="eyebrow">INCIDENT RESPONSE PLATFORM</div><h1>{register ? "Create your account" : "Welcome back"}</h1><p className="muted">Sign in to your workspace and continue the response.</p><form onSubmit={(event: FormEvent) => onSubmit(event, register)} className="auth-form">{register && <label>Full name<input required value={auth.name} onChange={(e: any) => setAuth({ ...auth, name: e.target.value })} placeholder="Alex Morgan" /></label>}<label>Work email<input type="email" required value={auth.email} onChange={(e: any) => setAuth({ ...auth, email: e.target.value })} placeholder="you@company.com" /></label><label>Password<input type="password" required minLength={register ? 10 : 1} value={auth.password} onChange={(e: any) => setAuth({ ...auth, password: e.target.value })} placeholder={register ? "At least 10 characters" : "Your password"} /></label>{error && <div className="inline-error">{error}</div>}<button className="button button-primary button-wide" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}<ChevronRight size={16} /></button></form><p className="auth-switch">{register ? "Already registered? " : "New to IncidentMind? "}<button onClick={() => navigate(register ? "/login" : "/register")}>{register ? "Sign in" : "Create an account"}</button></p><div className="auth-note"><ShieldCheck size={14} /> Your incident data stays in your environment.</div></section></div>;
}

function PageHeader({ eyebrow, title, description, action }: any) {
  return <div className="page-header"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function MetricCard({ label, value, helper, icon: Icon, tone = "blue", delta }: any) {
  return <section className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-helper">{delta && <span className={delta > 0 ? "delta-up" : "delta-down"}>{delta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(delta)}%</span>}{helper}</div></section>;
}

function DashboardPage({ dashboard, incidents, loading, navigate }: any) {
  const critical = dashboard?.severity?.critical || 0;
  const active = dashboard?.open_incidents || 0;
  const recent = dashboard?.recent || [];
  const months = trendMonths(incidents);
  const severityValues = ["critical", "high", "medium", "low"].map(name => ({ name, count: dashboard?.severity?.[name] || 0 }));
  const totalSeverity = Math.max(1, severityValues.reduce((sum, item) => sum + item.count, 0));
  return <div className="page-content">
    <PageHeader eyebrow="OPERATIONS OVERVIEW" title="Incident overview" description="A current view of service reliability and response activity." action={<button className="button button-primary" onClick={() => navigate("/incidents/new")}><Plus size={16} /> Report incident</button>} />
    <div className="metric-grid">
      <MetricCard label="Total incidents" value={dashboard?.total_incidents ?? "—"} helper="Across all recorded incidents" icon={Activity} tone="blue" />
      <MetricCard label="Active incidents" value={dashboard ? active : "—"} helper="Open or under investigation" icon={AlertCircle} tone="orange" />
      <MetricCard label="Resolved incidents" value={dashboard?.resolved_incidents ?? "—"} helper={`${dashboard?.resolution_rate ?? 0}% resolution rate`} icon={Check} tone="green" />
      <MetricCard label="Critical incidents" value={dashboard?.severity?.critical ?? "—"} helper="Requires immediate attention" icon={Siren} tone="red" />
    </div>
    <div className="dashboard-grid">
      <section className="surface chart-panel trend-panel"><PanelHeader title="Incident trend" subtitle="Reported incidents · last 6 months" /><TrendChart months={months} /></section>
      <section className="surface chart-panel"><PanelHeader title="Severity distribution" subtitle="Current incident inventory" /><SeverityChart values={severityValues} total={totalSeverity} /></section>
      <section className="surface table-panel"><PanelHeader title="Recent incidents" subtitle="The latest updates from your services" action={<button className="button button-link" onClick={() => navigate("/incidents")}>View all <ChevronRight size={15} /></button>} /><IncidentTable incidents={recent} loading={loading} navigate={navigate} compact /></section>
      <section className="surface activity-panel"><PanelHeader title="Recent activity" subtitle="Latest reported incidents" /><ActivityFeed incidents={recent.slice(0, 6)} loading={loading} navigate={navigate} /></section>
      <section className="surface resolution-panel"><PanelHeader title="Resolution time" subtitle="Mean time to resolve" /><div className="resolution-empty"><span className="resolution-icon"><Clock3 size={19} /></span><div><b>Not yet measurable</b><p>The incident API does not record resolution timestamps. Add a resolved-at field to enable accurate MTTR reporting.</p></div></div></section>
      <section className="surface memory-callout"><div className="callout-icon"><BookOpen size={18} /></div><div><b>Make each response count</b><p>Document verified causes and fixes so your team can reuse them.</p><button className="button button-link" onClick={() => navigate("/history")}>Explore incident memory <ChevronRight size={15} /></button></div></section>
    </div>
  </div>;
}

function PanelHeader({ title, subtitle, action }: any) { return <div className="panel-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>; }

function trendMonths(incidents: Incident[]) {
  const today = new Date();
  const months = Array.from({ length: 6 }, (_, index) => { const date = new Date(today.getFullYear(), today.getMonth() - 5 + index, 1); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`; });
  return months.map(key => ({ key, label: monthLabel(key), value: incidents.filter(item => monthKey(item.created_at) === key).length }));
}

function TrendChart({ months }: any) {
  const max = Math.max(1, ...months.map((month: any) => month.value));
  const points = months.map((month: any, index: number) => `${34 + index * 112},${125 - (month.value / max) * 82}`).join(" ");
  return <div className="trend-chart"><div className="chart-y-labels"><span>{max}</span><span>{Math.round(max / 2)}</span><span>0</span></div><div className="trend-plot"><svg viewBox="0 0 600 145" role="img" aria-label="Reported incidents by month"><line x1="0" y1="43" x2="600" y2="43" /><line x1="0" y1="84" x2="600" y2="84" /><line x1="0" y1="125" x2="600" y2="125" /><polyline points={points} />{months.map((month: any, index: number) => <circle key={month.key} cx={34 + index * 112} cy={125 - (month.value / max) * 82} r="4" />)}</svg><div className="chart-x-labels">{months.map((month: any) => <span key={month.key}>{month.label}</span>)}</div></div></div>;
}

function SeverityChart({ values, total }: any) {
  return <div className="severity-chart"><div className="severity-total"><strong>{values.reduce((sum: number, item: any) => sum + item.count, 0)}</strong><span>incidents</span></div><div className="severity-bars">{values.map((item: any) => <div className="severity-bar-row" key={item.name}><span className={`legend-dot ${item.name}`} /><span className="severity-name">{titleCase(item.name)}</span><span className="bar-track"><i className={item.name} style={{ width: `${Math.max(item.count ? 3 : 0, (item.count / total) * 100)}%` }} /></span><b>{item.count}</b></div>)}</div></div>;
}

function IncidentTable({ incidents, loading, navigate, compact = false }: any) {
  if (loading && !incidents.length) return <div className="table-loading"><span className="spinner" /> Loading incidents…</div>;
  if (!incidents.length) return <EmptyState icon={Activity} title="No incidents recorded" description="Reported incidents will appear here." />;
  return <div className="table-scroll"><table className={`incident-table ${compact ? "compact" : ""}`}><thead><tr><th>Incident ID</th><th>Title</th><th>Severity</th><th>Status</th><th>Created at</th><th>Assigned to</th></tr></thead><tbody>{incidents.map((incident: Incident) => <tr key={incident.id} onClick={() => navigate(`/incidents/${incident.id}`)}><td className="id-cell">INC-{String(incident.id).padStart(4, "0")}</td><td><b className="table-title">{incident.title}</b><small className="table-service">{incident.service_name}</small></td><td><Badge kind="severity" value={incident.severity} /></td><td><Badge kind="status" value={incident.status} /></td><td className="date-cell">{dateTime(incident.created_at)}</td><td className="assignee-cell"><span className="assignee-dash">—</span><small>Unassigned</small></td></tr>)}</tbody></table></div>;
}

function Badge({ kind, value }: { kind: "severity" | "status"; value: string }) { return <span className={kind === "severity" ? severityClass(value) : statusClass(value)}><i />{titleCase(value)}</span>; }

function ActivityFeed({ incidents, loading, navigate }: any) {
  if (loading && !incidents.length) return <div className="activity-loading"><span className="spinner" /> Loading activity…</div>;
  if (!incidents.length) return <EmptyState icon={FileClock} title="Nothing to show yet" description="Incident updates will appear in this feed." />;
  return <div className="activity-feed">{incidents.map((incident: Incident) => <button key={incident.id} className="feed-item" onClick={() => navigate(`/incidents/${incident.id}`)}><span className={`feed-marker ${incident.severity}`}><AlertTriangle size={13} /></span><span><b>{incident.title}</b><small>{incident.service_name} · {shortDate(incident.created_at)}</small></span><ChevronRight size={14} /></button>)}</div>;
}

function EmptyState({ icon: Icon, title, description, action }: any) { return <div className="empty-state"><span><Icon size={19} /></span><b>{title}</b><p>{description}</p>{action}</div>; }

function IncidentsPage({ incidents, allCount, loading, query, setQuery, severity, setSeverity, status, setStatus, navigate }: any) {
  return <div className="page-content"><PageHeader eyebrow="INCIDENT MANAGEMENT" title="Incidents" description="Track response, ownership, and service impact in one place." action={<button className="button button-primary" onClick={() => navigate("/incidents/new")}><Plus size={16} /> Report incident</button>} /><section className="surface list-surface"><div className="list-toolbar"><label className="list-search"><Search size={16} /><input placeholder="Search title, service, or description" value={query} onChange={e => setQuery(e.target.value)} /></label><label className="filter-select"><Filter size={14} /><select value={severity} onChange={e => setSeverity(e.target.value)}><option value="">All severities</option>{["critical", "high", "medium", "low"].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><label className="filter-select"><select value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{["open", "investigating", "mitigated", "resolved"].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label><span className="result-count">{incidents.length} of {allCount}</span></div><IncidentTable incidents={incidents} loading={loading} navigate={navigate} /></section></div>;
}

function CreateIncidentPage({ onSubmit, busy, navigate }: any) {
  return <div className="page-content narrow-page"><button className="back-link" onClick={() => navigate("/incidents")}>← Back to incidents</button><PageHeader eyebrow="INCIDENT INTAKE" title="Report an incident" description="Capture symptoms and impact. Similar historical incidents will be surfaced automatically." /><form className="surface incident-form" onSubmit={onSubmit}><label>Incident title<input name="title" required minLength={3} placeholder="e.g. Elevated API latency after deploy" /></label><div className="form-columns"><label>Service name<input name="service_name" required placeholder="payments-api" /></label><label>Severity<select name="severity" defaultValue="medium">{["critical", "high", "medium", "low"].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}</select></label></div><label>Description<textarea name="description" rows={5} minLength={10} required placeholder="Describe what is happening, who is affected, and when it started." /></label><label>Logs <span className="field-note">Optional</span><textarea name="logs" rows={4} placeholder="Relevant logs or error messages" /></label><label>Tags <span className="field-note">Comma separated</span><input name="tags" placeholder="database, deploy, latency" /></label><div className="form-footer"><span>IncidentMind will search prior incident records after submission.</span><button className="button button-primary" disabled={busy}>{busy ? <><span className="spinner light" /> Creating…</> : <><Plus size={15} /> Create incident</>}</button></div></form></div>;
}

function IncidentDetailPage({ incident, analysis, postmortem, postmortemLoading, busy, generatePostmortem, updateIncident, navigate }: any) {
  if (!incident) return <div className="page-content"><div className="loading-page"><span className="spinner" /> Loading incident record…</div></div>;
  const similar = analysis?.similar_incidents || [];
  const risk = recurrenceRisk(incident, similar);
  return <div className="page-content detail-page"><button className="back-link" onClick={() => navigate("/incidents")}>← Back to incidents</button><div className="detail-title-row"><div><div className="eyebrow">INC-{String(incident.id).padStart(4, "0")} <span>·</span> {incident.service_name}</div><h1>{incident.title}</h1><div className="detail-tags">{(incident.tags || []).map((tag: string) => <span key={tag}>{tag}</span>)}</div></div><div className="title-actions"><button className="button button-secondary" onClick={() => navigate("/chat")}><MessageSquare size={15} /> Ask assistant</button></div></div>
    <div className="detail-layout"><div className="detail-left">
      <section className="surface detail-card"><PanelHeader title="Incident summary" subtitle="Reported symptoms and impact" /><p className="incident-description">{incident.description}</p>{incident.logs && <><h3 className="section-kicker">LOG EXCERPT</h3><pre className="log-block">{incident.logs}</pre></>}{incident.failed_attempts?.length > 0 && <div className="failed-warning"><AlertTriangle size={16} /><div><b>Previously unsuccessful approaches</b>{incident.failed_attempts.map((attempt: string, index: number) => <p key={index}>{attempt}</p>)}</div></div>}</section>
      <section className="surface detail-card"><PanelHeader title="Root cause analysis" subtitle="Hypothesis based on the incident record and related history" />{analysis ? <><div className="analysis-box"><div><span className="analysis-label">CURRENT HYPOTHESIS</span><span className="confidence">{Math.round((analysis.confidence || 0) * 100)}% confidence</span></div><p>{analysis.root_cause}</p><small>{analysis.summary}</small></div><h3 className="section-kicker">SUGGESTED RESPONSE CHECKS</h3>{(analysis.next_actions || []).map((action: string, index: number) => <div className="response-check" key={index}><span>{String(index + 1).padStart(2, "0")}</span>{action}</div>)}</> : <div className="empty-inline"><span className="spinner" /> Preparing analysis…</div>}</section>
      <section className="surface detail-card"><PanelHeader title="Similar incidents" subtitle="Related historical records and their outcomes" action={<span className="subtle-count">{similar.length} matches</span>} />{similar.length ? <div className="similar-list">{similar.map((item: any) => <button key={item.id} onClick={() => navigate(`/incidents/${item.id}`)}><span className="similar-score">{Math.round(item.similarity * 100)}%</span><span className="similar-copy"><b>{item.title}</b><small>{item.service_name} · {titleCase(item.status)}</small>{item.root_cause && <p>Cause: {item.root_cause}</p>}</span><ChevronRight size={15} /></button>)}</div> : <EmptyState icon={Search} title="No close matches found" description="The current incident has no similar records in memory yet." />}</section>
      <section className="surface detail-card intelligence-card"><PanelHeader title="Incident intelligence" subtitle="Recurrence risk from similar history and fix outcomes" action={<span className={`risk-pill risk-${risk.level.toLowerCase()}`}>{risk.level} risk</span>} /><div className="risk-row"><div className="risk-score"><strong>{risk.score}</strong><span>/ 100</span></div><div className="risk-meter"><i className={`risk-fill risk-${risk.level.toLowerCase()}`} style={{ width: `${risk.score}%` }} /></div></div><div className="risk-reasons">{risk.reasons.map((reason: string) => <span key={reason}>{reason}</span>)}</div><p className="risk-note">Heuristic indicator using up to five similar incidents, recorded failed attempts, and whether a confirmed resolution exists. Use as a prioritization signal, not a forecast.</p></section>
    </div><aside className="detail-right"><section className="surface metadata-card"><h2>Incident properties</h2><div className="metadata-item"><span>Severity</span><Badge kind="severity" value={incident.severity} /></div><div className="metadata-item"><span>Status</span><select value={incident.status} onChange={e => updateIncident(incident.id, { status: e.target.value })}><option value="open">Open</option><option value="investigating">Investigating</option><option value="mitigated">Mitigated</option><option value="resolved">Resolved</option></select></div><div className="metadata-item"><span>Created</span><b>{dateTime(incident.created_at)}</b></div><div className="metadata-item"><span>Assigned team</span><b>Northstar Systems</b></div><div className="metadata-item"><span>Assignee</span><b className="muted-value">Unassigned</b></div><button className="button button-secondary button-wide" onClick={() => navigate("/chat")}>Open response assistant</button></section><section className="surface metadata-card"><h2>Resolution history</h2>{incident.root_cause || incident.resolution ? <div className="resolution-history"><div><Check size={14} /><b>{incident.outcome || "Resolution recorded"}</b></div><p><strong>Cause</strong> {incident.root_cause || "Not recorded"}</p><p><strong>Fix</strong> {incident.resolution || "Not recorded"}</p></div> : <p className="muted-copy">No confirmed resolution has been recorded for this incident.</p>}</section></aside></div>
    <section className="surface timeline-section"><PanelHeader title="Incident timeline" subtitle="Recorded response activity" />{incident.timeline?.length ? <div className="incident-timeline">{incident.timeline.map((event: any) => <div className="timeline-row" key={event.id}><span className="timeline-point" /><div><b>{titleCase(event.event_type)}</b><p>{event.message}</p><small>{dateTime(event.created_at)}</small></div></div>)}</div> : <EmptyState icon={FileClock} title="No timeline activity yet" description="Status changes and resolution updates will be shown here." />}</section>
    <section className="surface postmortem-section"><PanelHeader title="AI postmortem" subtitle="Draft a structured review from the incident record" action={<button className="button button-primary" onClick={generatePostmortem} disabled={postmortemLoading}>{postmortemLoading ? <><span className="spinner light" /> Generating…</> : <><FileText size={15} /> {postmortem ? "Regenerate postmortem" : "Generate postmortem"}</>}</button>} />{postmortem ? <><div className="postmortem-banner"><Check size={15} /><span>Saved on this device · Generated {dateTime(postmortem.generated_at)}</span><button className="button button-link" onClick={() => downloadPostmortem(incident, postmortem)}><Download size={14} /> Export</button></div><div className="postmortem-grid">{[["Executive summary", postmortem.executive_summary], ["Root cause", postmortem.root_cause], ["Impact", postmortem.impact], ["Timeline", postmortem.timeline], ["Resolution", postmortem.resolution], ["Lessons learned", postmortem.lessons_learned], ["Prevention plan", postmortem.prevention_plan]].map(([title, content]) => <article key={title}><h3>{title}</h3><p>{content}</p></article>)}</div></> : <div className="postmortem-empty"><FileText size={20} /><div><b>Turn the incident record into a review draft</b><p>Builds a shareable structure from the current cause, impact, timeline, resolution, and related history. Review details before circulation.</p></div></div>}</section>
    <section className="surface resolution-editor"><PanelHeader title="Resolution record" subtitle="Verified details are available to future responders" /><div className="resolution-fields"><label>Root cause<textarea id="root-cause-field" defaultValue={incident.root_cause || ""} rows={3} placeholder="Record the confirmed cause" /></label><label>Resolution<textarea id="resolution-field" defaultValue={incident.resolution || ""} rows={3} placeholder="Record the fix and recovery verification" /></label><label>Engineer notes<textarea id="notes-field" defaultValue={incident.engineer_notes || ""} rows={3} placeholder="Context for the next responder" /></label></div><div className="resolution-actions"><span>Updates are added to the incident record and searchable memory.</span><button className="button button-primary" onClick={() => updateIncident(incident.id, { root_cause: (document.getElementById("root-cause-field") as HTMLTextAreaElement).value, resolution: (document.getElementById("resolution-field") as HTMLTextAreaElement).value, engineer_notes: (document.getElementById("notes-field") as HTMLTextAreaElement).value, outcome: "successful" })} disabled={busy}>{busy ? "Saving…" : <><Check size={15} /> Save resolution</>}</button></div></section>
  </div>;
}

function recurrenceRisk(incident: Incident, similar: any[]) {
  const close = similar.filter(item => item.similarity >= 0.62).length;
  const recent = similar.filter(item => Date.now() - new Date(item.created_at).getTime() < 180 * 86400000).length;
  const priorFailures = similar.reduce((count, item) => count + (item.failed_attempts?.length || 0), 0) + (incident.failed_attempts?.length || 0);
  const unconfirmed = !incident.root_cause || !incident.resolution;
  const score = Math.min(100, close * 13 + recent * 8 + Math.min(priorFailures, 3) * 7 + (unconfirmed ? 16 : 0));
  const level = score >= 60 ? "High" : score >= 30 ? "Medium" : "Low";
  return { score, level, reasons: [`${close} strong matches`, `${recent} matches in last 6 months`, `${priorFailures} failed-fix records`, unconfirmed ? "Resolution not confirmed" : "Resolution recorded"] };
}

function downloadPostmortem(incident: Incident, postmortem: Postmortem) {
  const sections = ["executive_summary", "root_cause", "impact", "timeline", "resolution", "lessons_learned", "prevention_plan"];
  const content = `# Postmortem: ${incident.title}\n\n${sections.map(key => `## ${titleCase(key)}\n\n${postmortem[key]}`).join("\n\n")}`;
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `incident-${incident.id}-postmortem.md`; anchor.click(); URL.revokeObjectURL(url);
}

function HistoryPage({ incidents, loading, navigate }: any) {
  const learned = incidents.filter((incident: Incident) => incident.root_cause || incident.resolution);
  return <div className="page-content"><PageHeader eyebrow="OPERATIONAL KNOWLEDGE" title="Incident memory" description="Searchable resolution history, including approaches that did not work." action={<span className="count-chip">{learned.length} learned records</span>} />{loading && !incidents.length ? <LoadingState /> : learned.length ? <div className="memory-list">{learned.map((incident: Incident) => <button className="surface memory-row" key={incident.id} onClick={() => navigate(`/incidents/${incident.id}`)}><span className="memory-row-icon"><BookOpen size={17} /></span><span className="memory-row-copy"><b>{incident.title}</b><small>{incident.service_name} · {dateTime(incident.updated_at || incident.created_at)}</small><span><strong>Cause</strong> {incident.root_cause || "Not recorded"}</span><span><strong>Resolution</strong> {incident.resolution || "Not recorded"}</span>{incident.failed_attempts?.length > 0 && <span className="memory-warning"><AlertTriangle size={13} /> Previously failed: {incident.failed_attempts.join(" · ")}</span>}</span><Badge kind="status" value={incident.status} /><ChevronRight size={16} /></button>)}</div> : <EmptyState icon={BookOpen} title="Build your team's incident memory" description="Save verified root causes and resolutions on incidents to make them useful to the next responder." />}</div>;
}

function ChatPage({ messages, text, setText, onSubmit, incidents, selected, navigate }: any) {
  return <div className="page-content chat-page"><PageHeader eyebrow="RESPONSE ASSISTANT" title="Incident assistant" description="Ask operational questions and inspect the incident records behind each response." action={<span className="count-chip">{incidents.length} records searchable</span>} /><div className="chat-layout"><section className="surface chat-surface"><div className="chat-messages">{!messages.length ? <div className="chat-intro"><span><MessageSquare size={20} /></span><h2>Ask about incident history</h2><p>Search for prior symptoms, confirmed fixes, or troubleshooting approaches to avoid.</p><div>{["Have we seen database connection timeouts?", "What resolved the queue backlog?", "Which approaches failed on 502 incidents?"].map(prompt => <button key={prompt} onClick={() => setText(prompt)}>{prompt}<ChevronRight size={14} /></button>)}</div></div> : messages.map((message: any, index: number) => <div className={`chat-message ${message.role}`} key={index}><div className="chat-message-label">{message.role === "assistant" ? "IncidentMind" : "You"}</div><p>{message.content}</p>{message.references?.length ? <div className="chat-references"><small>RELATED INCIDENTS</small>{message.references.map((reference: any) => <button key={reference.id} onClick={() => navigate(`/incidents/${reference.id}`)}><span>{Math.round(reference.similarity * 100)}%</span>{reference.title}<ChevronRight size={13} /></button>)}</div> : null}</div>)}</div><form className="chat-composer" onSubmit={onSubmit}><textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); (event.currentTarget.form as HTMLFormElement)?.requestSubmit(); } }} placeholder="Ask about prior incidents or response actions…" rows={2} /><div><span>{selected ? `Context: ${selected.title}` : "Suggestions are advisory. Verify before acting."}</span><button className="button button-primary" disabled={!text.trim()}><Send size={14} /> Send</button></div></form></section><aside className="surface chat-context"><h2>Response context</h2><p>{selected ? `Focused on ${selected.title}` : "Searching across incident history."}</p><div><BookOpen size={15} />{incidents.length} incident records</div><div><ShieldCheck size={15} />Answers link back to source incidents</div><div className="context-note">Review impact and recovery conditions before using a suggested fix.</div></aside></div></div>;
}

function ExecutivePage({ dashboard, incidents, loading, navigate }: any) {
  const active = dashboard?.open_incidents || 0;
  const critical = dashboard?.severity?.critical || 0;
  const health = dashboard ? Math.max(0, Math.min(100, 100 - (active * 5) - (critical * 12))) : null;
  const months = trendMonths(incidents);
  const causeCounts = incidents.reduce((acc: Record<string, number>, item: Incident) => { if (item.root_cause) acc[item.root_cause] = (acc[item.root_cause] || 0) + 1; return acc; }, {} as Record<string, number>);
  const causes = (Object.entries(causeCounts) as [string, number][]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const serviceRows = dashboard?.services || [];
  return <div className="page-content executive-page"><PageHeader eyebrow="LEADERSHIP BRIEFING" title="Executive summary" description="A concise reliability snapshot for engineering and operations leadership." action={<span className="report-date">Updated {new Date().toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>} />
    <div className="executive-metrics"><section className="surface health-score-card"><div><span className="metric-overline">SYSTEM HEALTH SCORE</span><p>Incident pressure indicator</p></div><div className={`health-gauge ${health !== null && health < 60 ? "gauge-warning" : ""}`}><strong>{health ?? "—"}</strong><small>/ 100</small></div><small className="score-method">Calculated as 100 minus 5 points per active incident and 12 per critical incident.</small></section><MetricCard label="Monthly incidents" value={incidents.filter((item: Incident) => monthKey(item.created_at) === monthKey(new Date().toISOString())).length} helper="Reported this month" icon={Activity} tone="blue" /><MetricCard label="MTTR" value="Not tracked" helper="Resolution timestamps unavailable" icon={Clock3} tone="purple" /><MetricCard label="Critical incidents" value={dashboard?.severity?.critical ?? "—"} helper="Current incident inventory" icon={Siren} tone="red" /></div>
    <div className="executive-grid"><section className="surface"><PanelHeader title="Monthly incident trends" subtitle="Reports created in the last six months" /><TrendChart months={months} /></section><section className="surface"><PanelHeader title="Top recorded root causes" subtitle="From incident records with completed analysis" />{causes.length ? <div className="cause-ranking">{causes.map(([cause, count], index) => <div key={cause}><span>{index + 1}</span><b>{cause}</b><em>{count}</em></div>)}</div> : <EmptyState icon={FileText} title="No confirmed causes yet" description="Recorded root causes will be ranked here." />}</section><section className="surface team-performance"><PanelHeader title="Team performance" subtitle="Workspace response status and service activity" /><div className="team-kpis"><div><small>INCIDENTS RESOLVED</small><b>{dashboard?.resolved_incidents ?? "—"}</b></div><div><small>RESOLUTION RATE</small><b>{dashboard?.resolution_rate ?? 0}%</b></div><div><small>ACTIVE WORKLOAD</small><b>{active}</b></div></div><div className="performance-note"><Users size={16} /><span>Assigned-user and team-level resolution data are not exposed by the current API. These workspace totals avoid inferring individual performance.</span></div></section><section className="surface"><PanelHeader title="Service activity" subtitle="Incidents by affected service" />{serviceRows.length ? <div className="service-ranking">{serviceRows.map((service: any) => <div key={service.name}><span>{service.name}</span><i><b style={{ width: `${Math.max(8, service.count / Math.max(1, dashboard?.total_incidents || 1) * 100)}%` }} /></i><strong>{service.count}</strong></div>)}</div> : <EmptyState icon={Activity} title="No service data" description="Service activity appears as incidents are recorded." />}</section></div><p className="executive-footnote">{loading ? "Refreshing report…" : "Metrics reflect records available to the current workspace. MTTR requires resolution timestamp support from the incident API."} <button className="text-action" onClick={() => navigate("/incidents")}>Review incidents <ChevronRight size={13} /></button></p>
  </div>;
}

function LoadingState() { return <div className="loading-page"><span className="spinner" /> Loading incident data…</div>; }
