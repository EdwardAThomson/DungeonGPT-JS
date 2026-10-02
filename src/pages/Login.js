import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { sendEvent } from '../services/telemetry';
import '../styles/redesign.css';

// Sign-in landing (#82, in-app pages on the redesign primitives). Auth itself happens on
// the Octonion hub; this page explains what an account adds and hands off.
const Login = () => {
  const { user, redirectToLogin } = useAuth();

  // Funnel: reaching the login page at all counts as starting sign-in (the
  // actual auth happens on the Octonion hub, out of our instrumentation reach).
  useEffect(() => {
    if (!user) sendEvent('signin_started', {}, { once: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If already logged in, redirect to home
  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div
      className="rd-page rd-app login-screen"
      style={{ backgroundImage: "linear-gradient(rgba(14,13,19,.82), rgba(14,13,19,.94)), url('/assets/redesign/hero.jpg')" }}
    >
      <section className="band">
        <div className="wrap">
          <div className="login-card">
            <p className="eyebrow">Free account</p>
            <h1>Sign in to DungeonGPT</h1>
            <ul className="login-perks">
              <li><Tick /> The AI Dungeon Master: type any action, get a narrated scene</li>
              <li><Tick /> Heroes and saves kept on every device</li>
              <li><Tick /> Free. Members add premium realms and stronger models</li>
            </ul>
            <button type="button" className="btn btn-primary login-cta" onClick={redirectToLogin}>Continue to sign in</button>
            <p className="login-note">Sign-in is handled by <b>Octonion Software</b>. You'll be taken to our login page and brought straight back.</p>
            <div className="login-links">
              <Link to="/new-game">Play as a guest instead</Link>
              <Link to="/getting-started">How to play</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const Tick = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
);

export default Login;
