import { Component, lazy, type ComponentType, type ReactNode } from "react";
import { Button } from "./ui";
import { isLoadFailure } from "./loadFailure";

const loaders = new Set<() => Promise<unknown>>();

/** A view loaded on demand; `preloadLazyViews` fetches it ahead of need. */
export function lazyView<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  loaders.add(load);
  return lazy(() => load().then(view => ({ default: view })));
}

const preloaded = new Set<() => Promise<unknown>>();

/**
 * Fetch every on-demand view once the app is running. Browsers keep a failed module import for the
 * life of the page, so a view first opened during a server outage cannot load until a reload;
 * fetching views early leaves only the first moments of a session exposed.
 */
export function preloadLazyViews() {
  for (const load of loaders) {
    if (preloaded.has(load)) continue;
    preloaded.add(load);
    // A loaded view can register views of its own, such as the reader's History panel.
    void load().then(preloadLazyViews, () => { preloaded.delete(load); });
  }
}

interface Props { children: ReactNode; connected: boolean; compact?: boolean }
interface State { error: unknown }

/**
 * Keeps the rest of OpenDoc usable when one view fails. A browse view that could not load reloads
 * the app once the local server returns; the reader's panel offers the reload instead, so unsaved
 * text edits are never discarded without the user choosing to.
 */
export class LoadBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: unknown): State { return { error }; }
  componentDidUpdate(previous: Props) {
    if (!this.props.compact && isLoadFailure(this.state.error) && this.props.connected && !previous.connected) location.reload();
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const load = isLoadFailure(error);
    const { connected, compact } = this.props;
    return <div className={compact ? "load-failed load-failed-compact" : "empty-state load-failed"} role="alert">
      <h2>{load ? "This view couldn't load" : "This view stopped working"}</h2>
      <p>{load && !connected ? `OpenDoc can't reach the local server. ${compact ? "Reload OpenDoc once it's running again; save or discard text edits first." : "This view loads when the server is running again."}`
        : load ? `Reload OpenDoc to load it.${compact ? " Save or discard text edits first." : ""}`
        : "Something went wrong while showing it. Your saved work is unaffected."}</p>
      <div className="load-failed-actions">
        {!load && <Button onClick={() => this.setState({ error: null })}>Try again</Button>}
        {(!load || connected || compact) && <Button className={load ? undefined : "text-button"} onClick={() => location.reload()}>Reload OpenDoc</Button>}
      </div>
    </div>;
  }
}
