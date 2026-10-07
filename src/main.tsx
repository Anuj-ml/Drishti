import { StrictMode, Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

/**
 * A blank page is the worst possible failure mode for a console. If any module
 * throws while loading or rendering, show the reason instead of nothing.
 */
class BootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("IBVAP failed to start", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: "48px 24px", fontFamily: "ui-monospace, monospace", color: "#16171a" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>IBVAP could not start</h1>
        <p style={{ fontSize: 13, color: "#4b4e54", maxWidth: 820, lineHeight: 1.6 }}>
          The console threw an error while loading. The message below is the actual cause — fix it and reload.
        </p>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#fdeceb",
            border: "1px solid #f5c6c2",
            borderRadius: 10,
            padding: 16,
            fontSize: 12,
            lineHeight: 1.6,
            maxWidth: 920,
            overflowX: "auto",
          }}
        >
          {this.state.error.message}
          {"\n\n"}
          {this.state.error.stack}
        </pre>
        <button
          onClick={() => window.location.reload()}
          style={{ marginTop: 16, padding: "8px 14px", borderRadius: 8, border: "1px solid #e3e1dc", background: "#fff", cursor: "pointer" }}
        >
          Reload
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BootErrorBoundary>
      <App />
    </BootErrorBoundary>
  </StrictMode>
);
