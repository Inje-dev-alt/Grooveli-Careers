import { Component } from 'react';
import { Button } from '../ui/index.js';

/**
 * Last line of defence.
 *
 * A thrown render error in the world or a panel should not leave a black
 * screen with no explanation — it should say what happened and offer a way out.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[grooveli] unhandled error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="app">
        <div className="landing">
          <div className="landing__inner">
            <span className="landing__mark">!</span>
            <div>
              <h1 className="landing__title">Something broke</h1>
              <p className="landing__lede">
                {this.state.error.message || 'An unexpected error stopped the interface from rendering.'}
              </p>
            </div>
            <Button variant="primary" onClick={() => window.location.assign('/')}>
              Reload Grooveli
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
