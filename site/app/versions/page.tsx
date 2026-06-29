"use client";

import { useEffect, useState } from "react";
import {
  Download,
  FileSearch,
  ChevronDown,
  ExternalLink,
  Monitor,
  Tag,
  Calendar,
  ChevronLeft,
  ArrowUpRight,
  Package,
} from "lucide-react";
import Link from "next/link";

/* ── Types ── */

interface ReleaseAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
}

/* ── Platform helpers ── */

type Platform = "windows" | "linux";
type Arch = "x64" | "arm64";

const platformIcons: Record<Platform, React.ReactNode> = {
  windows: <Monitor className="h-4 w-4" strokeWidth={1.5} />,
  linux: (
    <svg
      className="h-4 w-4"
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
};

const platformLabels: Record<Platform, string> = {
  windows: "Windows",
  linux: "Linux",
};

const archLabels: Record<Arch, string> = {
  x64: "Intel/AMD 64-bit",
  arm64: "ARM64",
};

function classifyAsset(name: string): { platform: Platform; arch: Arch } | null {
  const lower = name.toLowerCase();

  const hasWindows = lower.includes("setup") && lower.endsWith(".exe");
  const hasLinux = lower.endsWith(".appimage");

  const isArm64 = lower.includes("arm64") || lower.includes("arm-64");

  let platform: Platform;
  if (hasWindows) platform = "windows";
  else if (hasLinux) platform = "linux";
  else return null;

  const arch: Arch = isArm64 ? "arm64" : "x64";
  return { platform, arch };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ── Component ── */

export default function VersionsPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const controller = new AbortController();

    async function fetchReleases() {
      try {
        const res = await fetch("/api/releases", {
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch releases (${res.status})`);
        }
        const data = await res.json();
        setReleases(data);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    fetchReleases();
    return () => controller.abort();
  }, []);

  const toggleExpanded = (tag: string) => {
    setExpanded((prev) => ({ ...prev, [tag]: !prev[tag] }));
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen">
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
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            Back to home
          </Link>
        </div>
      </nav>

      {/* ── Header ── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-bg/40 to-transparent" />
        <div className="relative mx-auto max-w-5xl px-6 pt-12 pb-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-primary-bg text-primary mb-4">
            <Package className="h-6 w-6" strokeWidth={1.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            All Versions
          </h1>
          <p className="mt-2 text-sm text-text-secondary max-w-md mx-auto">
            Download previous releases for Windows and Linux. Each version is
            fully offline and self-contained.
          </p>
        </div>
      </section>

      {/* ── Releases list ── */}
      <section className="flex-1 py-10 sm:py-14">
        <div className="mx-auto max-w-3xl px-6">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm text-text-tertiary">Loading releases…</p>
            </div>
          )}

          {error && (
            <div className="rounded-[var(--radius-lg)] border border-danger-subtle bg-danger-bg p-6 text-center">
              <p className="text-sm font-medium text-danger">Failed to load releases</p>
              <p className="mt-1 text-xs text-text-tertiary">{error}</p>
            </div>
          )}

          {!loading && !error && releases.length === 0 && (
            <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center">
              <p className="text-sm text-text-tertiary">No releases found yet.</p>
            </div>
          )}

          {!loading &&
            releases.map((release, idx) => {
              const isExpanded = expanded[release.tag_name] ?? idx === 0;
              return (
                <ReleaseCard
                  key={release.tag_name}
                  release={release}
                  isExpanded={isExpanded}
                  onToggle={() => toggleExpanded(release.tag_name)}
                />
              );
            })}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-border py-8 mt-auto">
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
                href="/"
                className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
              >
                Home
              </Link>
              <a
                href="https://github.com/Aditya190803/audit-app/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
              >
                GitHub releases
                <ExternalLink className="h-2.5 w-2.5" strokeWidth={2} />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ── Release Card ── */

function ReleaseCard({
  release,
  isExpanded,
  onToggle,
}: {
  release: Release;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const version = release.tag_name.replace(/^v/, "");

  // Group assets by platform
  const grouped: Record<string, { name: string; arch: string }[]> = {};
  for (const asset of release.assets) {
    const classified = classifyAsset(asset.name);
    if (!classified) continue;
    const key = classified.platform;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ name: asset.name, arch: classified.arch });
  }

  const hasAnyDownloads = Object.keys(grouped).length > 0;

  // Format release notes: strip excessive blank lines, truncate if collapsed
  const bodyPreview =
    release.body
      ?.split("\n")
      .filter((line) => line.trim() !== "")
      .slice(0, 5)
      .join("\n")
      .substring(0, 280) ?? "";

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-border bg-surface overflow-hidden transition-shadow duration-200 hover:shadow-sm">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-surface-hover transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-primary-bg text-primary">
            <Tag className="h-4 w-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-semibold text-text-primary">
              v{version}
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <Calendar className="h-3 w-3 text-text-tertiary" strokeWidth={1.5} />
              <span className="text-[11px] text-text-tertiary">
                {formatDate(release.published_at)}
              </span>
              {release.assets.length > 0 && (
                <>
                  <span className="text-text-tertiary">·</span>
                  <span className="text-[11px] text-text-tertiary">
                    {release.assets.length} asset{release.assets.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-text-tertiary shrink-0 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border-subtle px-5 py-4 animate-fade-in-up">
          {/* Release notes */}
          {release.body && (
            <div className="mb-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-2">
                Release Notes
              </h4>
              <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                {bodyPreview}
                {bodyPreview.length >= 280 && (
                  <span className="text-text-tertiary">…</span>
                )}
              </div>
              <a
                href={release.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-[11px] text-primary hover:text-primary-hover transition-colors"
              >
                View full changelog on GitHub
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
              </a>
            </div>
          )}

          {/* Downloads */}
          {hasAnyDownloads && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-3">
                Downloads
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(grouped) as Platform[]).map((platform) => (
                  <div
                    key={platform}
                    className="rounded-[var(--radius-md)] border border-border-subtle bg-surface-inset p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-text-tertiary">
                        {platformIcons[platform]}
                      </span>
                      <span className="text-xs font-semibold text-text-primary">
                        {platformLabels[platform]}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {grouped[platform].map((asset) => (
                        <a
                          key={asset.name}
                          href={`/releases/archive/${release.tag_name}/${encodeURIComponent(asset.name)}`}
                          className="inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-primary hover:bg-primary-bg transition-colors cursor-pointer"
                        >
                          <span className="truncate">
                            {archLabels[asset.arch as Arch] ?? asset.arch}
                          </span>
                          <Download className="h-3 w-3 shrink-0" strokeWidth={2} />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasAnyDownloads && (
            <p className="text-xs text-text-tertiary italic">
              No downloadable assets for this release.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
