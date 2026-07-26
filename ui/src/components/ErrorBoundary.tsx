import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMsg: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMsg: error.toString() };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 m-4 bg-red-900 border border-red-500 rounded text-white relative z-50">
          <h2 className="font-bold mb-2">Oups, une erreur d'affichage est survenue !</h2>
          <pre className="text-xs whitespace-pre-wrap">{this.state.errorMsg}</pre>
          {this.state.errorInfo && (
            <pre className="text-[10px] text-red-300 mt-2 whitespace-pre-wrap overflow-auto max-h-40">
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <button 
            className="mt-4 px-4 py-2 bg-red-700 hover:bg-red-600 rounded font-bold"
            onClick={() => window.location.reload()}
          >
            Recharger l'application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
