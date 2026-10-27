import {
  BookOpen, Cpu, FileText, FlaskConical, GitCompareArrows, GraduationCap, House, Info, Menu, Microscope,
  Network, Split, SquareChartGantt, X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { cx } from "../ui";
import { api } from "../../services/api";

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#12151c" stroke="rgb(255 255 255 / 0.12)" />
        <rect x="6" y="8" width="11" height="4" rx="2" fill="#22d3ee" />
        <rect x="12" y="14" width="14" height="4" rx="2" fill="#a78bfa" />
        <rect x="6" y="20" width="8" height="4" rx="2" fill="#22d3ee" opacity=".55" />
        <path d="M17.5 21.5 22 26M22 21.5 17.5 26" stroke="#a78bfa" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {!compact && (
        <span className="text-[17px] font-semibold tracking-tight text-fg">
          Sched<span className="bg-gradient-to-br from-violet-300 to-cyan-300 bg-clip-text text-transparent">X</span>
        </span>
      )}
    </span>
  );
}

export const NAV: { group: string; items: { to: string; label: string; icon: typeof Cpu }[] }[] = [
  { group: "Overview", items: [
    { to: "/", label: "Project Home", icon: House },
    { to: "/research", label: "Research", icon: Microscope },
    { to: "/about", label: "About & Team", icon: Info },
  ] },
  { group: "Lab", items: [
    { to: "/lab", label: "Scheduler Lab", icon: Cpu },
    { to: "/compare", label: "Algorithm Arena", icon: GitCompareArrows },
    { to: "/replay", label: "Decision Replay", icon: SquareChartGantt },
    { to: "/what-if", label: "What-If Analysis", icon: Split },
    { to: "/experiments", label: "Experiment Studio", icon: FlaskConical },
  ] },
  { group: "Learn", items: [
    { to: "/learn", label: "OS Concepts", icon: GraduationCap },
    { to: "/architecture", label: "Architecture", icon: Network },
    { to: "/docs", label: "Documentation", icon: FileText },
  ] },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="eyebrow mb-1.5 px-2.5">{g.group}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink
                  to={it.to}
                  end={it.to === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                      isActive ? "bg-white/[0.07] text-fg" : "text-fg-muted hover:bg-white/[0.04] hover:text-fg",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-gradient-to-b from-violet-300 to-cyan-300" />}
                      <it.icon className={cx("size-4", isActive ? "text-cyan-300" : "text-fg-faint group-hover:text-fg-muted")} aria-hidden />
                      {it.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BackendStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () =>
      api.health().then(() => alive && setOk(true)).catch(() => alive && setOk(false));
    check();
    const t = setInterval(check, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-xs text-fg-muted" role="status">
      <span className={cx("size-2 rounded-full", ok === null ? "bg-fg-faint" : ok ? "bg-good shadow-[0_0_8px_#0ca30c]" : "bg-critical")} />
      {ok === null ? "Checking engine…" : ok ? "Engine online" : "Engine offline"}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="min-h-screen">
      <div className="app-backdrop" />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:rounded focus:bg-ink-800 focus:px-3 focus:py-2">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="glass fixed inset-y-3 left-3 z-40 hidden w-60 flex-col rounded-2xl p-3 lg:flex">
        <Link to="/" className="mb-6 px-2 pt-1"><Logo /></Link>
        <div className="flex-1 overflow-y-auto"><SideNav /></div>
        <BackendStatus />
      </aside>
      {/* Mobile top bar */}
      <header className="glass sticky top-0 z-40 flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-2.5 lg:hidden">
        <Link to="/"><Logo /></Link>
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-fg-muted hover:bg-white/10" aria-label="Open navigation"><Menu className="size-5" /></button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="glass animate-fade-in absolute inset-y-0 left-0 flex w-72 flex-col rounded-r-2xl p-4">
            <div className="mb-6 flex items-center justify-between"><Logo /><button onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-1.5 hover:bg-white/10"><X className="size-5" /></button></div>
            <div className="flex-1 overflow-y-auto"><SideNav onNavigate={() => setOpen(false)} /></div>
            <BackendStatus />
          </div>
        </div>
      )}
      <main id="main" key={loc.pathname} className="animate-fade-in px-4 py-6 sm:px-6 lg:ml-[264px] lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}

export function TopNav() {
  const [open, setOpen] = useState(false);
  const links = [
    { to: "/lab", label: "Scheduler Lab" },
    { to: "/compare", label: "Arena" },
    { to: "/replay", label: "Replay" },
    { to: "/experiments", label: "Experiments" },
    { to: "/learn", label: "Learn" },
    { to: "/research", label: "Research" },
    { to: "/about", label: "About" },
  ];
  return (
    <header className="sticky top-3 z-40 mx-auto mt-3 w-[calc(100%-24px)] max-w-6xl">
      <div className="glass flex items-center justify-between rounded-2xl px-4 py-2.5">
        <Link to="/" aria-label="SchedX home"><Logo /></Link>
        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-white/[0.06] hover:text-fg">{l.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/lab" className="hidden h-9 items-center gap-2 rounded-lg bg-gradient-to-b from-violet-400 to-violet-600 px-3.5 text-sm font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:from-violet-300 sm:inline-flex">
            <Cpu className="size-4" /> Open Lab
          </Link>
          <button className="rounded-lg p-2 text-fg-muted hover:bg-white/10 md:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="glass animate-fade-in mt-2 grid grid-cols-2 gap-1 rounded-2xl p-2 md:hidden">
          {links.map((l) => <Link key={l.to} to={l.to} className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-white/[0.06]">{l.label}</Link>)}
          <Link to="/docs" className="rounded-lg px-3 py-2 text-sm text-fg-muted hover:bg-white/[0.06]"><BookOpen className="mr-1 inline size-4" />Docs</Link>
        </nav>
      )}
    </header>
  );
}
