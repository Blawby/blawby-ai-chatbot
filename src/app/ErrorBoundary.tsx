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
                <div className="p-4 m-4 border border-light-border dark:border-dark-border rounded-lg bg-light-input-bg dark:bg-dark-input-bg">
                    <h2 className="text-red-600 mb-4">Something went wrong</h2>
                    <details className="my-4">
                        <summary className="cursor-pointer text-accent">Error details</summary>
                        <pre className="mt-2 p-2 bg-light-bg dark:bg-dark-bg rounded overflow-x-auto">{this.state.error?.message}</pre>
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