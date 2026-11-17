/**
 * A stand-in for the React DevTools hook, installed before the app loads. React calls it on every commit, in
 * development and production builds alike, so the sweep can count commits and which components rendered
 * without any instrumentation in the app. Component names are minified in production, so the two components
 * the sweep cares about are recognised by what they draw (their data-testid / data-certificate-page hooks).
 */
export interface RenderStats {
  commits: number;
  renders: Record<string, number>;
  probeError?: string;
}

declare global {
  interface Window {
    __editorSweep: RenderStats;
  }
}

export function installRenderProbe() {
  const stats: RenderStats = { commits: 0, renders: {} };
  window.__editorSweep = stats;
  // Function, class, forwardRef and memo components.
  const COMPONENT_TAGS = new Set([0, 1, 11, 14, 15]);
  const PERFORMED_WORK = 1;

  type Fiber = { tag: number; flags: number; type: unknown; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null; stateNode: unknown };

  const nameOf = (fiber: Fiber) => {
    let host = fiber.child;
    while (host && typeof host.type !== "string") host = host.child;
    const element = host?.stateNode;
    if (element instanceof HTMLElement) {
      if (element.hasAttribute("data-certificate-page")) return "CertificateRenderer";
      if (element.dataset.testid?.startsWith("template-editor")) return "EditorWorkspace";
    }
    const type = fiber.type as { displayName?: string; name?: string } | null;
    return type?.displayName || type?.name || "anonymous";
  };

  // Only fibers that performed work in this commit count; a subtree whose children are unchanged was skipped.
  const visit = (next: Fiber, previous: Fiber | null) => {
    if (COMPONENT_TAGS.has(next.tag) && (next.flags & PERFORMED_WORK) === PERFORMED_WORK) {
      const name = nameOf(next);
      stats.renders[name] = (stats.renders[name] ?? 0) + 1;
    }
    if (previous && next.child === previous.child) return;
    for (let child = next.child; child; child = child.sibling) visit(child, child.alternate);
  };

  const renderers = new Map<number, unknown>();
  (window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    isDisabled: false,
    renderers,
    inject(renderer: unknown) {
      renderers.set(renderers.size + 1, renderer);
      return renderers.size;
    },
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      stats.commits += 1;
      try {
        visit(root.current, root.current.alternate);
      } catch (error) {
        stats.probeError = String(error);
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    checkDCE() {},
  };
}
