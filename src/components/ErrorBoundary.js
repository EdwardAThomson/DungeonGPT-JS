import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || 'Unknown error' };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ERROR_BOUNDARY] Unhandled UI error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-container" style={{ maxWidth: 680, margin: '40px auto', textAlign: 'center' }}>
          <h2>Something Went Wrong</h2>
          <p>The application hit an unexpected error.</p>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {this.state.errorMessage}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
            <button onClick={this.handleReset}>Try Again</button>
            <button onClick={() => window.location.assign('/')}>Go Home</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

