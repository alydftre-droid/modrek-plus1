import { Component, ErrorInfo, ReactNode } from "react";
import { reportError } from "@/lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Top-level ErrorBoundary. Prevents the app from rendering a blank white
 * screen when an unhandled render error occurs. Logs the error to the console
 * (and to `window.__mp_last_error` for post-mortem inspection) and shows an
 * Arabic RTL fallback with a reload action.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, errorInfo);
    try {
      (window as unknown as { __mp_last_error?: unknown }).__mp_last_error = {
        message: error?.message,
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
        at: new Date().toISOString(),
      };
    } catch {
      // ignore storage errors
    }
  }

  handleReload = () => {
    try {
      window.location.reload();
    } catch {
      // ignore
    }
  };

  handleHome = () => {
    try {
      window.location.assign("/");
    } catch {
      // ignore
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const message = this.state.error?.message || "خطأ غير متوقع";
    return (
      <div
        dir="rtl"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#f8fafc",
          fontFamily: "Cairo, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "white",
            borderRadius: 16,
            padding: 24,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0" }}>
            حدث خطأ غير متوقع
          </h1>
          <p style={{ color: "#64748b", fontSize: 14, marginBottom: 16 }}>
            نعتذر عن الإزعاج. يمكنك إعادة تحميل التطبيق أو العودة للرئيسية.
          </p>
          <details style={{ textAlign: "start", marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: 12 }}>
              تفاصيل تقنية
            </summary>
            <pre
              style={{
                fontSize: 11,
                color: "#475569",
                background: "#f1f5f9",
                padding: 8,
                borderRadius: 8,
                overflow: "auto",
                maxHeight: 160,
                marginTop: 8,
              }}
            >
              {message}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                background: "#2563eb",
                color: "white",
                border: 0,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              إعادة تحميل
            </button>
            <button
              onClick={this.handleHome}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                background: "#e2e8f0",
                color: "#0f172a",
                border: 0,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              الرئيسية
            </button>
          </div>
        </div>
      </div>
    );
  }
}
