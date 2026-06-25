"use client";
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-6 text-center border border-border">
            <div className="text-5xl mb-4">⚠️</div>
            <h3 className="text-lg font-bold text-text-primary mb-2">
              Something went wrong
            </h3>
            <p className="text-text-secondary text-sm mb-4">
              We encountered an error while loading the dashboard.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="text-left mb-4 p-3 bg-red-50 rounded-lg text-xs text-google-red overflow-auto max-h-32">
                <strong>Error:</strong> {this.state.error.toString()}
                {this.state.errorInfo && (
                  <pre className="mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-google-blue hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-colors"
              >
                Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-4 py-2 bg-surface hover:bg-border text-text-primary rounded-full text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}