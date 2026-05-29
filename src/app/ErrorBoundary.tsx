import { Component, ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';

interface Props {
    children: ComponentChildren;
    fallback?: ComponentChildren;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state = {
        hasError: false,
        error: null
    };

    static getDerivedStateFromError(error: Error) {
        return {
            hasError: true,
            error
        };
    }

    componentDidCatch(error: Error, errorInfo: unknown) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <div className="p-6 m-4 panel border-accent-error/20 shadow-glass">
                    <h2 className="text-xl font-bold text-accent-error-light mb-4">Something went wrong</h2>
                    <details className="my-4">
                        <summary className="cursor-pointer text-accent-500 font-medium hover:text-accent-400 transition-colors">Error details</summary>
                        <pre className="mt-2 p-4 bg-paper/40 dark:bg-paper-2/10 border border-line-subtle rounded-r-md overflow-x-auto text-sm text-accent-error/80">{this.state.error?.message}</pre>
                    </details>
                    <Button 
                        variant="primary"
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                        }}
                    >
                        Try again
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
} 