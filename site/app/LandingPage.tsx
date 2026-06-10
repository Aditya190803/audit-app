"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Download,
  Shield,
  FileSearch,
  Zap,
  Table2,
  FileText,
  Monitor,
  Apple,
  Lock,
  ChevronDown,
  ExternalLink,
  Search,
  Settings,
  Plus,
  PanelLeft,
  BarChart3,
  Clock,
  ArrowDownRight,
  ArrowUpRight,
  AlertTriangle,
  Layers,
} from "lucide-react";
import Link from "next/link";

type Platform = "windows" | "mac" | "linux";

function detectOS(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

function getPlatformInfo(version: string) {
  return {
    windows: {
      name: "Windows",
      icon: <Monitor className="h-5 w-5" strokeWidth={1.5} />,
      downloads: {
        x64: {
          label: "Download for Windows (64-bit)",
          fileName: `Bank.Audit.App.Setup.${version}.exe`,
          format: ".exe installer",
          available: true,
        },
        arm64: {
          label: "Download for Windows (ARM64)",
          fileName: `Bank.Audit.App.Setup.${version}-arm64.exe`,
          format: ".exe installer",
          available: true,
        },
      },
    },
    mac: {
      name: "macOS",
      icon: <Apple className="h-5 w-5" strokeWidth={1.5} />,
      downloads: {
        x64: {
          label: "Download for macOS (Intel)",
          fileName: `Bank.Audit.App-${version}.dmg`,
          format: ".dmg",
          available: true,
        },
        arm64: {
          label: "Download for macOS (Apple Silicon)",
          fileName: `Bank.Audit.App-${version}-arm64.dmg`,
          format: ".dmg",
          available: true,
        },
      },
    },
    linux: {
      name: "Linux",
      icon: (
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2C9.24 2 7 5.58 7 10c0 2.05.5 3.9 1.3 5.32C7.06 16.55 5 17.64 5 19.5 5 21.43 7.24 22 10 22h4c2.76 0 5-.57 5-2.5 0-1.86-2.06-2.95-3.3-4.18C16.5 13.9 17 12.05 17 10c0-4.42-2.24-8-5-8z" />
        </svg>
      ),
      downloads: {
        x64: {
          label: "Download for Linux (64-bit)",
          fileName: `Bank.Audit.App-${version}.AppImage`,
          format: ".AppImage",
          available: true,
        },
        arm64: {
          label: "Download for Linux (ARM64)",
          fileName: `Bank.Audit.App-${version}-arm64.AppImage`,
          format: ".AppImage",
          available: true,
        },
      },
    },
  };
}

const features = [
  {
    icon: FileSearch,
    title: "Smart PDF Parsing",
    description:
      "Extracts transactions from bank statement PDFs — including scanned documents via OCR.",
  },
  {
    icon: Zap,
    title: "Fuzzy Name Matching",
    description:
      "Matches transaction parties against your client and broker lists using intelligent fuzzy logic.",
  },
  {
    icon: Shield,
    title: "Suspicious Detection",
    description:
      "Flags high-value transactions and configurable keywords so nothing slips through.",
  },
  {
    icon: Table2,
    title: "Powerful Data Table",
    description:
      "Sort, filter, and review hundreds of transactions in a responsive table with keyboard shortcuts.",
  },
  {
    icon: FileText,
    title: "Flexible Export",
    description:
      "Export tagged results to Excel with custom formatting, ready for your audit workpapers.",
  },
  {
    icon: Lock,
    title: "Fully Offline",
    description:
      "All data stays on your machine — just install and run.",
  },
];

const workflowSteps = [
  { title: "Upload", detail: "Drop bank statement PDFs" },
  { title: "Import", detail: "Load client & broker lists" },
  { title: "Review", detail: "Auto-tagged, manually refine" },
  { title: "Export", detail: "One-click audit workpaper" },
];

const allPlatforms: Platform[] = ["windows", "mac", "linux"];

function getManifestPath(yaml: string): string | null {
  const pathMatch = yaml.match(/^path:\s*(.+)$/m);
  if (pathMatch?.[1]) return pathMatch[1].trim();

  const urlMatch = yaml.match(/^\s*-\s*url:\s*(.+)$/m);
  if (urlMatch?.[1]) return urlMatch[1].trim();

  return null;
}

/* ── Intersection Observer ── */
function useInView(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

/* ── Workflow Timeline ── */
function WorkflowTimeline() {
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  const advance = useCallback(() => {
    setActive((prev) => (prev + 1) % workflowSteps.length);
  }, []);

  useEffect(() => {
    timer.current = setInterval(advance, 2800);
    return () => clearInterval(timer.current);
  }, [advance]);

  return (
    <div className="flex items-start gap-0 w-full max-w-2xl mx-auto">
      {workflowSteps.map((step, i) => {
        const isActive = i === active;
        const isPast = i < active;
        return (
          <button
            key={i}
            onClick={() => {
              setActive(i);
              clearInterval(timer.current);
              timer.current = setInterval(advance, 2800);
            }}
            className="flex-1 group cursor-pointer text-left"
          >
            {/* Progress bar */}
            <div className="relative h-0.5 w-full mb-4">
              <div className="absolute inset-0 bg-border rounded-full" />
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all"
                style={{
                  width: isActive ? "100%" : isPast ? "100%" : "0%",
                  background: isPast ? "var(--border-strong)" : isActive ? "var(--primary)" : "transparent",
                  transitionDuration: isActive ? "2800ms" : "300ms",
                  transitionTimingFunction: isActive ? "linear" : "var(--ease-out)",
                }}
              />
              {/* Dot */}
              <div
                className={`absolute -top-[3px] left-0 h-2 w-2 rounded-full border-2 transition-all duration-300 ${
                  isActive
                    ? "bg-primary border-primary scale-125"
                    : isPast
                    ? "bg-border-strong border-border-strong"
                    : "bg-surface border-border"
                }`}
              />
            </div>
            <span
              className={`text-xs font-semibold transition-colors duration-200 ${
                isActive ? "text-primary" : isPast ? "text-text-secondary" : "text-text-tertiary"
              }`}
            >
              {step.title}
            </span>
            <p
              className={`text-[11px] mt-0.5 leading-snug transition-all duration-300 ${
                isActive
                  ? "text-text-secondary opacity-100 translate-y-0"
                  : "text-text-tertiary opacity-0 translate-y-1"
              }`}
            >
              {step.detail}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   APP MOCKUP — Faithful reproduction of the Electron app UI
   ══════════════════════════════════════════════════════════════════════════════ */

const mockSessions = [
  { name: "FY 2024-25 — Shah Industries", date: "22 May", active: true },
  { name: "Q3 Reconciliation", date: "18 May", active: false },
  { name: "Patel Trading Co.", date: "12 May", active: false },
];

const mockTransactions = [
  { date: "15/03/2025", party: "Shah Industries Pvt Ltd", type: "Credit", amount: "₹4,25,000", tag: "client", match: "Shah Industries" },
  { date: "14/03/2025", party: "Mehta & Associates", type: "Debit", amount: "₹1,87,500", tag: "broker", match: "Mehta Brokers" },
  { date: "14/03/2025", party: "Cash Deposit - Branch", type: "Credit", amount: "₹12,50,000", tag: "suspicious", match: "—" },
  { date: "13/03/2025", party: "Reliance Industries Ltd", type: "Debit", amount: "₹3,42,800", tag: "client", match: "Reliance Ind." },
  { date: "13/03/2025", party: "Unknown Entity XYZ", type: "Debit", amount: "₹8,75,000", tag: "suspicious", match: "—" },
  { date: "12/03/2025", party: "Gupta Financial Services", type: "Credit", amount: "₹2,15,000", tag: "broker", match: "Gupta Finance" },
  { date: "12/03/2025", party: "Tata Consultancy Svc", type: "Debit", amount: "₹95,400", tag: "client", match: "TCS" },
  { date: "11/03/2025", party: "Interest Credit — SB", type: "Credit", amount: "₹12,847", tag: "none", match: "—" },
];

function TagBadge({ tag }: { tag: string }) {
  const styles: Record<string, string> = {
    client: "bg-[#d1fae5] text-[#059669]",
    broker: "bg-[#fef3c7] text-[#d97706]",
    suspicious: "bg-[#fee2e2] text-[#dc2626]",
    none: "bg-[#f3f4f7] text-[#9ca3af]",
  };
  const labels: Record<string, string> = {
    client: "Client",
    broker: "Broker",
    suspicious: "Suspicious",
    none: "Untagged",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full ${styles[tag] || styles.none}`}>
      {labels[tag] || tag}
    </span>
  );
}

function AppMockup() {
  return (
    <div
      className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg)] overflow-hidden"
      style={{ boxShadow: "0 20px 60px -12px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.03)" }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)]">
        <div className="flex gap-1.5">
          <div className="w-[10px] h-[10px] rounded-full bg-[#ff5f57]" />
          <div className="w-[10px] h-[10px] rounded-full bg-[#febc2e]" />
          <div className="w-[10px] h-[10px] rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[10px] text-[var(--text-tertiary)] ml-2 font-medium">Bank Audit App</span>
      </div>

      <div className="flex" style={{ height: 380 }}>
        {/* Sidebar */}
        <div className="w-[180px] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0">
          <div className="px-3 py-2.5 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">Sessions</span>
            <div className="flex gap-0.5">
              <div className="p-1 rounded text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]">
                <Plus className="h-3 w-3" strokeWidth={2} />
              </div>
              <div className="p-1 rounded text-[var(--text-tertiary)]">
                <PanelLeft className="h-3 w-3" strokeWidth={1.5} />
              </div>
            </div>
          </div>
          <div className="flex-1 py-1.5 px-1.5 space-y-0.5 overflow-hidden">
            {mockSessions.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-2 py-2 rounded-[var(--radius-md)] text-left ${
                  s.active
                    ? "bg-[var(--primary-bg)] border border-[var(--primary)]/15"
                    : ""
                }`}
              >
                <div className={`p-1 rounded ${s.active ? "bg-[var(--primary-subtle)]" : "bg-[var(--surface-inset)]"}`}>
                  <FileText className={`h-3 w-3 ${s.active ? "text-[var(--primary)]" : "text-[var(--text-tertiary)]"}`} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-[10px] font-medium truncate ${s.active ? "text-[var(--primary)]" : "text-[var(--text-primary)]"}`}>
                    {s.name}
                  </div>
                  <div className="text-[9px] text-[var(--text-tertiary)] flex items-center gap-1 mt-0.5">
                    <Clock className="h-2 w-2" strokeWidth={2} />
                    {s.date}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-2 py-1.5 border-t border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-[var(--text-secondary)] rounded">
              <Settings className="h-3 w-3" strokeWidth={1.5} />
              Settings
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="h-[40px] bg-[var(--surface)] border-b border-[var(--border)] px-3 flex items-center gap-2 shrink-0">
            {/* View tabs */}
            <div className="flex items-center bg-[var(--bg-raised)] rounded-lg p-0.5 border border-[var(--border-subtle)]">
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[var(--surface)] text-[var(--primary)] shadow-xs ring-1 ring-[var(--border)]">
                <Table2 className="h-3 w-3" strokeWidth={1.5} />
                Transactions
              </div>
              <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[var(--text-tertiary)]">
                <BarChart3 className="h-3 w-3" strokeWidth={1.5} />
                Review
              </div>
            </div>

            <div className="h-4 w-px bg-[var(--border)]" />

            {/* Search */}
            <div className="relative flex-1 max-w-[200px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={2} />
              <div className="w-full pl-7 pr-2 py-1 text-[10px] bg-[var(--bg)] border border-[var(--border)] rounded-md text-[var(--text-tertiary)]">
                Search transactions...
              </div>
            </div>

            <div className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] border border-[var(--border)] rounded-md bg-[var(--surface)]">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />
              Filters
            </div>

            <div className="flex-1" />

            <span className="text-[9px] text-[var(--text-tertiary)] font-medium truncate max-w-[120px] hidden sm:inline">
              FY 2024-25 — Shah Industries
            </span>

            <div className="h-4 w-px bg-[var(--border)]" />

            <div className="p-1 text-[var(--text-secondary)]">
              <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
            </div>
          </div>

          {/* KPI Row */}
          <div className="px-3 py-2 flex gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface)]">
            {[
              { label: "Transactions", value: "2,847", color: "var(--primary)", icon: <Layers className="h-3 w-3" /> },
              { label: "Total Debit", value: "₹1.2Cr", color: "var(--danger)", icon: <ArrowDownRight className="h-3 w-3" /> },
              { label: "Total Credit", value: "₹1.8Cr", color: "var(--success)", icon: <ArrowUpRight className="h-3 w-3" /> },
              { label: "Tagged", value: "73%", color: "var(--primary)", icon: <Layers className="h-3 w-3" /> },
            ].map((stat, i) => (
              <div key={i} className="flex-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] relative overflow-hidden">
                <div className="absolute top-0 left-0 w-[2px] h-full rounded-r" style={{ backgroundColor: stat.color }} />
                <div className="flex items-center justify-between mb-0.5 ml-1">
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{stat.label}</span>
                  <span style={{ color: stat.color }}>{stat.icon}</span>
                </div>
                <div className="text-[12px] font-bold font-mono ml-1" style={{ color: stat.color === "var(--primary)" ? "var(--text-primary)" : stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Data table */}
          <div className="flex-1 overflow-hidden">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="bg-[var(--bg-raised)] border-b border-[var(--border)]">
                  <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Date</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Party</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Type</th>
                  <th className="text-right px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Amount</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Tag</th>
                  <th className="text-left px-3 py-1.5 font-semibold text-[var(--text-tertiary)] text-[9px] uppercase tracking-wider">Match</th>
                </tr>
              </thead>
              <tbody>
                {mockTransactions.map((tx, i) => (
                  <tr key={i} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]">
                    <td className="px-3 py-1.5 font-mono text-[var(--text-tertiary)]">{tx.date}</td>
                    <td className="px-3 py-1.5 font-medium text-[var(--text-primary)] max-w-[160px] truncate">{tx.party}</td>
                    <td className={`px-3 py-1.5 ${tx.type === "Debit" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{tx.type}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-medium text-[var(--text-primary)]">{tx.amount}</td>
                    <td className="px-3 py-1.5"><TagBadge tag={tx.tag} /></td>
                    <td className="px-3 py-1.5 text-[var(--text-tertiary)]">{tx.match}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LandingPageProps {
  initialVersion: string;
}

export default function LandingPage({ initialVersion }: LandingPageProps) {
  const [detectedOS, setDetectedOS] = useState<Platform>("windows");
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [appVersion, setAppVersion] = useState(initialVersion);
  const [platforms, setPlatforms] = useState(() => getPlatformInfo(initialVersion));
  const { ref: heroRefElement, inView: heroInView } = useInView(0.1);
  const { ref: featuresRefElement, inView: featuresInView } = useInView();
  const { ref: downloadRefElement, inView: downloadInView } = useInView();

  // Hydration-safe OS detection: default to "windows" during SSR,
  // then detect the real OS after mount to avoid hydration mismatches.
  useEffect(() => {
    setDetectedOS(detectOS());
  }, []);

  useEffect(() => {

    // Fetch the latest version manifest dynamically
    fetch("/releases/latest.yml")
      .then((res) => {
        if (!res.ok) return null;
        return res.text();
      })
      .then((yaml) => {
        if (!yaml) return;
        const match = yaml.match(/^version:\s*(.+)$/m);
        if (match && match[1]) {
          const latestVersion = match[1].trim();
          const manifestPath = getManifestPath(yaml);
          const nextPlatforms = getPlatformInfo(latestVersion);

          if (manifestPath) {
            nextPlatforms.windows.downloads.x64.fileName = manifestPath;
          }

          setAppVersion(latestVersion);
          setPlatforms(nextPlatforms);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch latest version manifest:", err);
      });
  }, []);

  return (
    <div className="flex flex-col flex-1">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-primary">
              <FileSearch className="h-4 w-4 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold tracking-tight text-text-primary">
              Bank Audit App
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <a href="#features" className="hidden sm:inline text-[13px] text-text-tertiary hover:text-text-primary transition-colors cursor-pointer">
              Features
            </a>
            <Link
              href="/versions"
              className="hidden sm:inline text-[13px] text-text-tertiary hover:text-text-primary transition-colors"
            >
              All Versions
            </Link>
            <a
              href="#download"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-primary px-3.5 py-1.5 text-sm font-medium text-white transition-all duration-150 hover:bg-primary-hover hover:-translate-y-px shadow-xs cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2} />
              Download
            </a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRefElement} className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-bg/60 to-transparent" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "radial-gradient(var(--text-tertiary) 0.5px, transparent 0.5px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-12 sm:pt-20 sm:pb-16">
          {/* Copy — centered */}
          <div
            className={`stagger max-w-2xl mx-auto text-center transition-all duration-700 ${
              heroInView ? "opacity-100" : "opacity-0"
            }`}
          >
            <h1 className="text-3xl font-bold leading-[1.15] tracking-tight text-text-primary sm:text-[40px]">
              Audit bank statements{" "}
              <span className="text-primary">in minutes,</span>{" "}
              not hours
            </h1>

            <p className="mt-5 text-[15px] leading-relaxed text-text-secondary max-w-lg mx-auto">
              Drop your PDFs, import your client list, and let the app tag every
              transaction automatically. Review what matters, export when ready.
            </p>

            {/* Workflow Timeline */}
            <div className="mt-8">
              <WorkflowTimeline />
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3">
              {platforms[detectedOS].downloads.x64.available ? (
                <a
                  href={`/releases/${platforms[detectedOS].downloads.x64.fileName}`}
                  className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-primary-hover hover:-translate-y-px shadow-sm cursor-pointer"
                >
                  <Download className="h-4 w-4" strokeWidth={2} />
                  {platforms[detectedOS].downloads.x64.label}
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-primary/40 px-5 py-2.5 text-sm font-medium text-white/70 cursor-not-allowed">
                  <Download className="h-4 w-4" strokeWidth={2} />
                  {platforms[detectedOS].downloads.x64.label} — Coming Soon
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className="text-xs text-text-tertiary">
                  v{appVersion} · Offline only
                </span>
                {platforms[detectedOS].downloads.arm64.available && (
                  <>
                     <span className="text-xs text-text-tertiary">·</span>
                     <a
                       href={`/releases/${platforms[detectedOS].downloads.arm64.fileName}`}
                       className="text-xs text-text-tertiary hover:text-primary transition-colors cursor-pointer"
                     >
                       ARM64 version
                     </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* App Mockup — full width below copy */}
          <div
            className={`mt-12 transition-all duration-700 delay-200 ${
              heroInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            }`}
          >
            <AppMockup />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" ref={featuresRefElement} className="border-t border-border py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div
            className={`max-w-md transition-all duration-500 ${
              featuresInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              What it does
            </h2>
            <p className="mt-2 text-sm text-text-secondary leading-relaxed">
              Purpose-built for CA firms. No bloat, no learning curve.
            </p>
          </div>

          <div className="mt-12 grid gap-px bg-border rounded-[var(--radius-lg)] overflow-hidden border border-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className={`group bg-surface p-6 transition-all duration-500 hover:bg-surface-hover ${
                  featuresInView ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  transitionDelay: featuresInView ? `${i * 60}ms` : "0ms",
                }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-primary-bg text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                  <feature.icon className="h-4 w-4" strokeWidth={1.75} />
                </div>
                <h3 className="mt-3.5 text-[13px] font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-[12px] leading-[1.6] text-text-tertiary">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Download ── */}
      <section id="download" ref={downloadRefElement} className="border-t border-border py-20 sm:py-24 bg-surface-inset">
        <div className="mx-auto max-w-5xl px-6">
          <div
            className={`max-w-md mx-auto text-center transition-all duration-500 ${
              downloadInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <h2 className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl">
              Download
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Version {appVersion} · All data stays local
            </p>
          </div>

          {/* Primary download */}
          <div
            className={`mt-10 mx-auto max-w-md transition-all duration-500 delay-100 ${
              downloadInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
          >
            <div className="rounded-[var(--radius-lg)] border border-primary/20 bg-surface p-6 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary-bg text-primary">
                {platforms[detectedOS].icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold text-text-primary">
                {platforms[detectedOS].name} Downloads
              </h3>
              <div className="mt-4 flex flex-col gap-2">
                {platforms[detectedOS].downloads.x64.available ? (
                  <a
                    href={`/releases/${platforms[detectedOS].downloads.x64.fileName}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all duration-150 hover:bg-primary-hover hover:-translate-y-px shadow-xs cursor-pointer"
                  >
                    <Download className="h-4 w-4" strokeWidth={2} />
                    64-bit Installer (Intel/AMD)
                  </a>
                ) : (
                  <span className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-surface-hover border border-border px-4 py-2.5 text-sm font-medium text-text-tertiary cursor-not-allowed">
                    64-bit Installer — Coming Soon
                  </span>
                )}
                {platforms[detectedOS].downloads.arm64.available && (
                  <a
                    href={`/releases/${platforms[detectedOS].downloads.arm64.fileName}`}
                    className="inline-flex w-full items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium text-text-secondary hover:text-primary transition-colors cursor-pointer"
                  >
                    Also available for ARM64
                    <ExternalLink className="h-3 w-3" strokeWidth={2} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Other platforms */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllPlatforms(!showAllPlatforms)}
              className="inline-flex items-center gap-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer"
            >
              Other platforms
              <ChevronDown
                className={`h-3 w-3 transition-transform duration-200 ${showAllPlatforms ? "rotate-180" : ""}`}
                strokeWidth={2}
              />
            </button>

            {showAllPlatforms && (
              <div className="mt-4 flex flex-wrap justify-center gap-4 animate-fade-in-up">
                {allPlatforms
                  .filter((p) => p !== detectedOS)
                  .map((p) => {
                    const plat = platforms[p];
                    return (
                      <div
                        key={p}
                        className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-center min-w-[200px]"
                      >
                        <div className="mx-auto flex h-10 w-10 items-center justify-center text-text-tertiary bg-surface-hover rounded-md">
                          {plat.icon}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-text-primary">{plat.name}</p>
                        <div className="mt-3 flex flex-col gap-1.5">
                          {plat.downloads.x64.available ? (
                            <a
                              href={`/releases/${plat.downloads.x64.fileName}`}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary hover:bg-primary-bg transition-colors cursor-pointer"
                            >
                              <Download className="h-3.5 w-3.5" />
                              64-bit
                              <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />
                            </a>
                          ) : (
                            <span className="text-xs text-text-tertiary">
                              64-bit — Coming soon
                            </span>
                          )}
                          {plat.downloads.arm64.available && (
                            <a
                              href={`/releases/${plat.downloads.arm64.fileName}`}
                              className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-md text-[11px] text-text-tertiary hover:text-primary transition-colors cursor-pointer"
                            >
                              ARM64
                              <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] bg-primary">
                <FileSearch className="h-3 w-3 text-white" strokeWidth={2} />
              </div>
              <span className="text-xs font-medium text-text-secondary">
                Bank Audit App
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/versions"
                className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
              >
                All Versions
              </Link>
              <p className="text-[11px] text-text-tertiary">
                Built for Shah Kapadia &amp; Associates · theska.in
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
