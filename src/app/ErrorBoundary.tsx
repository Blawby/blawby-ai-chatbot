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
                <div className="p-6 m-4 glass-panel border-red-500/20 shadow-xl">
                    <h2 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h2>
                    <details className="my-4">
                        <summary className="cursor-pointer text-accent-500 font-medium hover:text-accent-400 transition-colors">Error details</summary>
                        <pre className="mt-2 p-4 bg-white/5 border border-white/10 rounded-xl overflow-x-auto text-sm text-red-200/80">{this.state.error?.message}</pre>
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