import { Component, ReactNode } from "react";
import OfflineFallback from "./OfflineFallback";

interface State {
  hasError: boolean;
  isChunkError: boolean;
  key: number;
}

/**
 * Wraps <Suspense> children so a failed dynamic import while OFFLINE
 * doesn't blank the app. Online chunk errors still fall through to the
 * top-level auto-reload logic in main.tsx.
 */
export default class LazyRouteBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { hasError: false, isChunkError: false, key: 0 };

  static getDerivedStateFromError(err: unknown): State {
    const msg = String((err as any)?.message || err || "");
    const isChunkError =
      /Failed to fetch dynamically imported module/i.test(msg) ||
      /Importing a module script failed/i.test(msg) ||
      /Loading chunk [\w-]+ failed/i.test(msg) ||
      /error loading dynamically imported module/i.test(msg);
    return { hasError: true, isChunkError, key: 0 };
  }

  componentDidCatch(error: unknown) {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    // Only swallow when it is BOTH a chunk-load error AND offline.
    // Otherwise re-throw so main.tsx / ErrorBoundary can handle it.
    if (!(this.state.isChunkError && offline)) {
      // Let top-level handler decide (auto-reload for online chunk misses).
      if (this.state.isChunkError) {
        // Give main.tsx's window error handler a chance
        setTimeout(() => window.dispatchEvent(new ErrorEvent("error", { message: String((error as any)?.message || error) })), 0);
      }
    }
  }

  retry = () => {
    this.setState((s) => ({ hasError: false, isChunkError: false, key: s.key + 1 }));
  };

  render() {
    if (this.state.hasError) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (this.state.isChunkError && offline) {
        return <OfflineFallback onRetry={this.retry} />;
      }
      // Online chunk error → try reload once
      if (this.state.isChunkError) {
        return <OfflineFallback onRetry={() => window.location.reload()} title="حدث خطأ أثناء تحميل الصفحة" message="جاري إعادة تحميل التطبيق..." />;
      }
      // Unknown error → let the outer ErrorBoundary render its UI on next render
      throw new Error("LazyRouteBoundary: unknown error");
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
