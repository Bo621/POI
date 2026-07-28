import React from "react";

interface ErrorBoundaryProps {
    label: string;
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    message?: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {};

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        return {message: error instanceof Error ? error.message : "알 수 없는 오류"};
    }

    render() {
        if (this.state.message) {
            return (
                <div className="notice" role="alert">
                    <p>{this.props.label}을(를) 표시하지 못했습니다.</p>
                    <p>{this.state.message}</p>
                    <button className="btn" type="button" onClick={() => this.setState({message: undefined})}>
                        다시 시도
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
