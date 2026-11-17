"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type FocusEvent, type MouseEvent, type ReactNode } from "react";
import { AssetImage } from "@/components/AssetImage";

export interface ShellNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Other path prefixes under which this item also counts as the current page. */
  activeUnder?: string[];
}

export interface ShellBrand {
  name: string;
  /** API path of the organisation's logo, shown instead of the name when present. */
  logoPath?: string | null;
}

interface AppShellProps {
  brand: ShellBrand;
  workspaceLabel: string;
  homeHref: string;
  navigationLabel: string;
  items: ShellNavItem[];
  email: string;
  onLogout: () => void;
  /** Shows the sidebar as the icon rail on this page without changing the saved preference (template editor). */
  forceRail?: boolean;
  /** Classes for <main>. */
  mainClassName?: string;
  /** Classes for the container around the page content. */
  contentClassName?: string;
  children: ReactNode;
}

// ----- The saved sidebar preference: a display setting in localStorage, shared across tabs. Not session data. -----

const SIDEBAR_PREFERENCE_KEY = "credential-ecosystem-ui:sidebar";
type SidebarPreference = "expanded" | "collapsed";
const preferenceListeners = new Set<() => void>();

function readPreference(): SidebarPreference | null {
  try {
    const value = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
    return value === "expanded" || value === "collapsed" ? value : null;
  } catch {
    return null;
  }
}

function savePreference(value: SidebarPreference) {
  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, value);
  } catch {
    // Storage can be unavailable (private windows); the choice then lasts until the page is left.
  }
  preferenceListeners.forEach((listener) => listener());
}

function subscribePreference(listener: () => void) {
  preferenceListeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === SIDEBAR_PREFERENCE_KEY) listener(); };
  window.addEventListener("storage", onStorage);
  return () => {
    preferenceListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// ----- Screen widths: expanded by default from 1024 px, the icon rail from 768 px, a top bar and drawer below. -----

const WIDE_QUERY = "(min-width: 1024px)";
const MEDIUM_QUERY = "(min-width: 768px)";

function subscribeQuery(query: string) {
  return (listener: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", listener);
    return () => list.removeEventListener("change", listener);
  };
}
const subscribeWide = subscribeQuery(WIDE_QUERY);
const subscribeMedium = subscribeQuery(MEDIUM_QUERY);
const readWide = () => window.matchMedia(WIDE_QUERY).matches;
const readMedium = () => window.matchMedia(MEDIUM_QUERY).matches;
const assumeWide = () => true;
const noPreference = () => null;

function isActive(item: ShellNavItem, pathname: string) {
  return [item.href, ...(item.activeUnder ?? [])].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function initialOf(text: string) {
  return (text.trim().charAt(0) || "?").toUpperCase();
}

interface TooltipState {
  label: string;
  top: number;
  left: number;
}

/**
 * The shared page frame of every signed-in area: a sidebar that is either expanded (240 px) or an icon rail
 * (64 px), remembered per browser, and on small screens a top bar with a menu button that opens the full
 * sidebar as a drawer. Each role's layout supplies the navigation items, the brand and the account actions.
 */
export function AppShell({ brand, workspaceLabel, homeHref, navigationLabel, items, email, onLogout, forceRail = false, mainClassName, contentClassName, children }: AppShellProps) {
  const pathname = usePathname();
  const sidebarId = useId();
  const drawerId = useId();
  const preference = useSyncExternalStore(subscribePreference, readPreference, noPreference);
  const isWide = useSyncExternalStore(subscribeWide, readWide, assumeWide);
  const isMedium = useSyncExternalStore(subscribeMedium, readMedium, assumeWide);

  // On a page that forces the rail, "expand" applies to this visit only; leaving the page drops it.
  const [visitExpanded, setVisitExpanded] = useState(false);
  const [railForced, setRailForced] = useState(forceRail);
  if (railForced !== forceRail) {
    setRailForced(forceRail);
    setVisitExpanded(false);
  }
  const savedExpanded = preference ? preference === "expanded" : isWide;
  const expanded = forceRail ? visitExpanded : savedExpanded;

  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  // The drawer is a native modal dialog: it keeps focus inside, closes on Escape and returns focus to the menu button.
  const drawerRef = useRef<HTMLDialogElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer only exists on small screens: close it when the window grows, or when the page changes.
  useEffect(() => {
    if (isMedium) drawerRef.current?.close();
  }, [isMedium]);
  useEffect(() => {
    drawerRef.current?.close();
  }, [pathname]);

  function toggleSidebar() {
    setTooltip(null);
    if (forceRail) setVisitExpanded(!expanded);
    else savePreference(expanded ? "collapsed" : "expanded");
  }

  function openDrawer() {
    drawerRef.current?.showModal();
    setDrawerOpen(true);
  }

  // Tooltips for the rail, drawn at a fixed position so the sidebar's own scrolling cannot clip them.
  const tooltipProps = (label: string) => ({
    onMouseEnter: (event: MouseEvent<HTMLElement>) => showTooltip(label, event.currentTarget),
    onMouseLeave: () => setTooltip(null),
    onFocus: (event: FocusEvent<HTMLElement>) => showTooltip(label, event.currentTarget),
    onBlur: () => setTooltip(null),
  });
  function showTooltip(label: string, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }

  const panelProps = { brand, workspaceLabel, homeHref, navigationLabel, items, pathname, email, onLogout };

  return (
    <div className="min-h-dvh bg-slate-100 md:flex">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
        <button
          aria-controls={drawerId}
          aria-expanded={drawerOpen}
          aria-label="Open navigation"
          className="rounded-md p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600"
          onClick={openDrawer}
          type="button"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>
        <Link className="flex min-w-0 items-center gap-2 font-semibold text-slate-950" href={homeHref}>
          <BrandMark brand={brand} />
          <span className="truncate">{brand.name}</span>
        </Link>
      </header>

      <dialog
        aria-label={navigationLabel}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-white p-0 shadow-xl backdrop:bg-slate-950/40 md:hidden"
        id={drawerId}
        // A click on the dialog element itself (not its contents) is a click on the backdrop, outside the drawer.
        onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}
        onClose={() => setDrawerOpen(false)}
        ref={drawerRef}
      >
        <SidebarPanel
          {...panelProps}
          headerAction={(
            <button aria-label="Close navigation" className="rounded-md p-2 text-slate-600 hover:bg-slate-100" onClick={() => drawerRef.current?.close()} type="button">
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
          onNavigate={() => drawerRef.current?.close()}
          rail={false}
          tooltipProps={() => ({})}
        />
      </dialog>

      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col overflow-x-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex ${expanded ? "w-60" : "w-16"}`}
        data-sidebar-state={expanded ? "expanded" : "rail"}
        id={sidebarId}
      >
        <SidebarPanel
          {...panelProps}
          headerAction={(
            <button
              aria-controls={sidebarId}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-teal-600"
              onClick={toggleSidebar}
              type="button"
              {...(expanded ? {} : tooltipProps("Expand sidebar"))}
            >
              {expanded ? <PanelLeftClose aria-hidden="true" className="size-5" /> : <PanelLeftOpen aria-hidden="true" className="size-5" />}
            </button>
          )}
          rail={!expanded}
          tooltipProps={expanded ? () => ({}) : tooltipProps}
        />
      </aside>

      <main className={mainClassName ?? "min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10"}>
        <div className={contentClassName ?? "mx-auto max-w-5xl"}>{children}</div>
      </main>

      {tooltip && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
          data-shell-tooltip=""
          style={{ top: tooltip.top, left: tooltip.left }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}

type TooltipHandlers = (label: string) => Partial<{
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
}>;

/** The sidebar's contents, drawn either expanded (labels) or as the icon rail (icons with tooltips). */
function SidebarPanel({ brand, workspaceLabel, homeHref, navigationLabel, items, pathname, email, onLogout, rail, headerAction, onNavigate, tooltipProps }: {
  brand: ShellBrand;
  workspaceLabel: string;
  homeHref: string;
  navigationLabel: string;
  items: ShellNavItem[];
  pathname: string;
  email: string;
  onLogout: () => void;
  rail: boolean;
  headerAction: ReactNode;
  onNavigate?: () => void;
  tooltipProps: TooltipHandlers;
}) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${rail ? "items-center px-2 py-4" : "p-4"}`}>
      {rail ? (
        <div className="flex flex-col items-center gap-2">
          <Link aria-label={`${brand.name}, ${workspaceLabel}`} className="rounded-md focus-visible:outline-2 focus-visible:outline-teal-600" href={homeHref} onClick={onNavigate} {...tooltipProps(brand.name)}>
            <BrandMark brand={brand} />
          </Link>
          {headerAction}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link className="block font-semibold text-slate-950" href={homeHref} onClick={onNavigate}>
              {brand.logoPath
                ? <AssetImage alt={brand.name} className="max-h-10 w-auto max-w-full object-contain" path={brand.logoPath} />
                : <span className="block truncate text-lg">{brand.name}</span>}
            </Link>
            <p className="mt-1 truncate text-sm text-slate-500">{workspaceLabel}</p>
          </div>
          {headerAction}
        </div>
      )}

      <nav aria-label={navigationLabel} className={`mt-6 min-h-0 flex-1 overflow-y-auto ${rail ? "w-full" : ""}`}>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={rail ? item.label : undefined}
                  className={`flex items-center gap-3 rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-600 ${rail ? "justify-center p-2.5" : "px-3 py-2"} ${active ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}
                  href={item.href}
                  onClick={onNavigate}
                  {...tooltipProps(item.label)}
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  {!rail && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {rail ? (
        <div className="mt-4 flex flex-col items-center gap-2 border-t border-slate-200 pt-4">
          <span
            aria-label={`Signed in as ${email}`}
            className="flex size-9 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white"
            role="img"
            {...tooltipProps(email)}
          >
            {initialOf(email)}
          </span>
          <button aria-label="Log out" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-2 focus-visible:outline-teal-600" onClick={onLogout} type="button" {...tooltipProps("Log out")}>
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </div>
      ) : (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="break-all text-sm text-slate-600">{email}</p>
          <button className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={onLogout} type="button">
            <LogOut aria-hidden="true" className="size-4" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

/** A small square mark: the organisation's logo, or the first letter of its name. */
function BrandMark({ brand }: { brand: ShellBrand }) {
  if (brand.logoPath) {
    return (
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-slate-200">
        <AssetImage alt="" className="max-h-8 max-w-8 object-contain" path={brand.logoPath} />
      </span>
    );
  }
  return <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-teal-700 text-sm font-semibold text-white">{initialOf(brand.name)}</span>;
}
