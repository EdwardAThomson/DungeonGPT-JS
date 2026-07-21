import { useContext, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SettingsContext from '../contexts/SettingsContext';
import { Navigate, Link } from 'react-router-dom';
import { sendEvent } from '../services/telemetry';
import '../styles/login.css';

const Login = () => {
  const { user, redirectToLogin } = useAuth();
  const { theme } = useContext(SettingsContext);

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
    <div className="login-page" data-theme={theme}>
      <div className="login-container">
        <h1 className="login-title">DungeonGPT</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          DungeonGPT uses <strong>Octonion Software</strong> for secure sign-in.
          You'll be taken to our login page and brought right back.
        </p>
        <button
          className="login-button"
          onClick={redirectToLogin}
        >
          Continue to Sign In
        </button>
        <div className="login-links">
          <Link to="/how-to-play" className="how-to-play-link">
            📚 How to Play
          </Link>
          <Link to="/" className="back-home-link">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;
