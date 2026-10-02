import { Component, type ReactNode } from "react";
import { Button } from "./ui";

/**
 * Lazily loaded views fail to load while the local server is unreachable. React caches the failed
 * import, so recovery reloads the app once the server is back instead of leaving a blank screen.
 */
export class LoadBoundary extends Component<{ children: ReactNode; compact?: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className={this.props.compact ? "load-failed load-failed-compact" : "empty-state load-failed"} role="alert">
      <h2>This view couldn't load</h2>
      <p>OpenDoc can't reach the local server. Reload once the server is running again.</p>
      <Button onClick={() => location.reload()}>Reload</Button>
    </div>;
  }
}
