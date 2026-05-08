# Design System

## Overview

A calm, authoritative desktop application for bank-statement auditing. The visual language draws from the brand identity of Shah Kapadia & Associates (theska.in): deep navy authority, crisp teal precision, and generous whitespace that respects the accountant's focus. The interface feels like a well-organized physical audit file — everything in its place, nothing superfluous.

## Theme

Light mode only. The target user is a CA firm employee working at a desk in a bright office during business hours. The ambient light is ample; the mood is concentrated diligence. Dark mode would feel out of place and reduce readability for long document-review sessions.

## Color Strategy

Restrained: tinted neutrals carry 90% of the surface; a single teal accent carries the interactive energy. Navy appears only in the logo/branding moments, not as a UI chrome color.

### Palette

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#f6f7f9` | App background, behind all surfaces. Tinted cool-gray toward navy. |
| `--surface` | `#ffffff` | Cards, panels, sidebar, popovers. |
| `--surface-hover` | `#f0f1f4` | Hover states on surface elements. |
| `--border` | `#e2e4e9` | Dividers, table borders, subtle separators. |
| `--border-strong` | `#c8cbd2` | Input borders, focus rings, stronger dividers. |
| `--text-primary` | `#111827` | Headings, primary text. Very dark cool gray, not pure black. |
| `--text-secondary` | `#4b5563` | Body text, labels, descriptions. |
| `--text-tertiary` | `#9ca3af` | Disabled text, placeholders, metadata. |
| `--primary` | `#0d9488` | Teal accent. Buttons, active nav, selection, links. |
| `--primary-hover` | `#0f766e` | Primary hover / pressed. |
| `--primary-subtle` | `#f0fdfa` | Teal tint for badges, highlights, active-row backgrounds. |
| `--danger` | `#dc2626` | Error states, destructive actions, suspicious tags. |
| `--danger-subtle` | `#fef2f2` | Danger tint backgrounds. |
| `--success` | `#059669` | Positive tags, success toasts. |
| `--success-subtle` | `#ecfdf5` | Success tint backgrounds. |
| `--warning` | `#d97706` | Warning tags, caution states. |
| `--warning-subtle` | `#fffbeb` | Warning tint backgrounds. |
| `--navy-brand` | `#115591` | Logo mark, branded header accents only. |

### Color Usage Rules

- Never use `#000` or `#fff`; always use the tokens above.
- Teal (`--primary`) is the only saturated color in interactive elements.
- Tag colors (success, warning, danger) are reserved for status badges and never used as buttons or links.
- Navy (`--navy-brand`) appears only in the app logo/wordmark, not in buttons, borders, or backgrounds.

## Typography

| Role | Font | Weight | Size | Line-Height | Letter-Spacing |
|---|---|---|---|---|---|
| App Title | Inter | 600 | 16px | 1.25 | -0.01em |
| Section Heading | Inter | 600 | 14px | 1.3 | 0 |
| Body | Inter | 400 | 13px | 1.5 | 0 |
| Label / Caption | Inter | 500 | 11px | 1.4 | 0.01em |
| Mono / Data | JetBrains Mono | 400 | 12px | 1.4 | 0 |

- Body text in tables and panels is capped at 65ch.
- Hierarchy through weight contrast (600 vs 400) and size steps (16 / 14 / 13 / 11).
- All labels and metadata are uppercase with positive letter-spacing for scanability.

## Spacing & Layout

| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 24px |
| `--space-6` | 32px |

- Sidebar width: `260px`.
- Header height: `48px`.
- Panel padding varies: `16px` for dense tables, `24px` for empty states and dialogs.
- Rhythm: tight inside data-dense areas (8px), airy around focal points (24–32px).

## Border Radius

| Token | Value |
|---|---|
| `--radius-sm` | 6px |
| `--radius-md` | 8px |
| `--radius-lg` | 10px |

- Buttons and inputs use `--radius-md`.
- Large panels and modals use `--radius-lg`.
- Small tags and chips use `--radius-sm`.

## Elevation

No drop shadows on static cards. Shadows are reserved for:
- Floating dropdowns / menus: `0 4px 12px rgba(0,0,0,0.08)`.
- Modals (rare): `0 8px 24px rgba(0,0,0,0.12)`.
- Drag-active states: `0 2px 8px rgba(0,0,0,0.06)`.

Surfaces are separated by 1px `--border` lines, not shadows.

## Components

### Button

- **Primary**: `bg-[--primary]`, white text, `radius-md`, `px-3 py-1.5`, `font-medium text-sm`. Hover: `bg-[--primary-hover]`. Transition: `150ms` color.
- **Secondary**: white bg, `border border-[--border-strong]`, `--text-primary` text. Hover: `bg-[--surface-hover]`.
- **Ghost**: transparent bg, `--text-secondary` text. Hover: `bg-[--surface-hover] text-[--text-primary]`.
- No border-radius extremes (fully rounded pills are avoided).

### Input

- White background, `border-[--border-strong]`, `radius-md`.
- Focus: `ring-2 ring-[--primary] border-transparent`.
- Placeholder: `--text-tertiary`.

### Tag / Badge

- **Client**: `bg-[--success-subtle] text-[--success]`.
- **Broker**: `bg-[--warning-subtle] text-[--warning]`.
- **Suspicious**: `bg-[--danger-subtle] text-[--danger]`.
- All tags: `radius-sm`, `px-2 py-0.5`, `font-medium text-xs`, inline-flex with centered text.

### Sidebar Item

- Full-width button, `px-3 py-2`, `radius-md`.
- Active: `bg-[--primary-subtle] text-[--primary]`.
- Inactive: `text-[--text-secondary]`; hover: `bg-[--surface-hover] text-[--text-primary]`.
- Transition: `150ms` background-color.

### Panel

- `bg-[--surface]`, `border border-[--border]`, `radius-lg`.
- No shadow by default.
- Padding adapts to content density.

### Data Table

- Header: `text-xs font-medium text-[--text-tertiary] uppercase tracking-wider`, `border-b border-[--border]`.
- Row height: `40px`.
- Hover: `bg-[--surface-hover]`.
- Selected: `bg-[--primary-subtle]`.
- Cell padding: `px-3`.

## Motion

- Easing: `cubic-bezier(0.25, 0.1, 0.25, 1)` (ease-out-quart equivalent) for all transitions.
- Durations: `150ms` for color/background, `200ms` for width/height/transform (only on non-layout properties like opacity and transform).
- No bounce, no elastic, no layout-property animations.
- Respect `prefers-reduced-motion`.

## Iconography

- Source: `lucide-react`.
- Stroke width: `1.5` (default).
- Size: `16px` in buttons and labels, `20px` in empty states, `14px` in tags.
- Color inherits from text color; never applies a separate icon color.
