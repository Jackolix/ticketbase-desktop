import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  /** Shown in the message, e.g. "the ticket list". */
  label?: string;
  /** Changing this resets the boundary — used to recover on navigation. */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Catches render errors so one broken view does not blank the whole window.
 *
 * There were no boundaries anywhere before this: any render error took out the
 * entire app, and since failures were only ever logged to a console nobody had
 * open, it looked like the app had simply frozen.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error caught by boundary:', error, info.componentStack);
    this.setState({ info });
  }

  componentDidUpdate(prevProps: Props) {
    // Recover when the user navigates elsewhere, rather than stranding them on
    // the error screen until they restart the app.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null });
    }
  }

  private reset = () => this.setState({ error: null, info: null });

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const what = this.props.label ?? 'this view';

    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-lg w-full border-destructive/40">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="font-semibold">Something broke in {what}</h2>
                <p className="text-sm text-muted-foreground">
                  The rest of the app is still running. You can retry, or switch to
                  another view.
                </p>
              </div>
            </div>

            {/* The actual error, not a generic apology — this is an internal
                tool, and the person seeing it can act on the detail. */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Technical details
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted p-3 whitespace-pre-wrap break-words">
                {error.message}
                {info?.componentStack}
              </pre>
            </details>

            <Button variant="outline" size="sm" onClick={this.reset} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
