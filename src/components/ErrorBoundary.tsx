"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  /** A short name for the log, e.g. "certificate preview". */
  name: string;
  /** When any of these change after a failure, the boundary tries to draw its children again. */
  resetKeys?: unknown[];
  fallback: (failure: { error: Error; reset: () => void }) => ReactNode;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function sameKeys(a: unknown[] = [], b: unknown[] = []) {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/**
 * Catches errors thrown while drawing its children and shows a fallback instead of an empty page. Everything
 * outside the boundary keeps working.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`The ${this.props.name} could not be drawn:`, error, info.componentStack);
  }

  componentDidUpdate(previous: ErrorBoundaryProps) {
    if (this.state.error && !sameKeys(previous.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    return this.state.error ? this.props.fallback({ error: this.state.error, reset: this.reset }) : this.props.children;
  }
}

/** The message shown when drawing fails: what happened, the technical details collapsed, and ways forward. */
export function DrawingFailure({ title, error, children }: { title: string; error: Error; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-red-300 bg-white p-5 text-sm text-slate-800 shadow-sm" role="alert">
      <p className="text-base font-semibold text-red-800">{title}</p>
      <p className="mt-1 text-slate-600">Your settings are kept. Try again, or go back to the last saved version.</p>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">Technical details</summary>
        <p className="mt-1 break-words font-mono">{error.name}: {error.message}</p>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
