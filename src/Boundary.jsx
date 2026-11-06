import { Component } from 'react';

/** Last line of defence: a render error must never leave a black screen. Offer a clean way back instead. */
export default class Boundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { try { console.error(err); } catch { /* ignore */ } }
  render() {
    if (!this.state.err) return this.props.children;
    const reset = () => { try { for (const k of Object.keys(window.localStorage)) if (/story|monarque/i.test(k)) window.localStorage.removeItem(k); } catch { /* storage blocked */ } window.location.reload(); };
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#080b0c', color: '#e6e8e2', fontFamily: 'Georgia, serif', textAlign: 'center', padding: 24 }}>
        <div>
          <h1 style={{ letterSpacing: '.12em' }}>THE HALL WENT DARK</h1>
          <p style={{ color: '#b9beb6' }}>Something failed to render. Your saved story run may be from an older build.</p>
          <button onClick={reset} style={{ padding: '10px 22px', background: '#59151a', color: '#fff', border: '1px solid #8a2a31', borderRadius: 8, cursor: 'pointer', fontSize: '1rem' }}>Reset story save and reload</button>
        </div>
      </div>
    );
  }
}
