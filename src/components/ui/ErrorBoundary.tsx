import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

/** Sprečava beli ekran: svaka greška u renderovanju se prikazuje poruka sa opcijom ponovnog učitavanja. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="card p-8 max-w-lg text-center">
          <h1 className="text-xl font-bold mb-2">Došlo je do greške u aplikaciji</h1>
          <p className="text-muted mb-4">{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}>
            Povratak na početnu
          </button>
        </div>
      </div>
    );
  }
}
