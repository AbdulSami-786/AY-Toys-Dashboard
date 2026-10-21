import { Component } from 'react';

// A window (or the whole app) that hits a bug shows this instead of going blank. The books are saved on this
// computer as they are changed, so nothing is lost: closing the window or reloading starts fresh.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('AY Toys error', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="pad" role="alert" style={{ maxWidth: 560, margin: '40px auto' }}>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p>{this.props.whole ? 'AY Toys hit an unexpected problem.' : 'This window hit an unexpected problem.'} Your books are saved — nothing was lost.</p>
        <p className="muted small">{String(error?.message || error)}</p>
        <button className="btn primary" onClick={this.props.whole ? () => window.location.reload() : () => this.setState({ error: null })}>
          {this.props.whole ? 'Reload AY Toys' : 'Try again'}
        </button>
      </div>
    );
  }
}
