import { useContext } from 'react';
import { useAuth } from '../contexts/AuthContext';
import SettingsContext from '../contexts/SettingsContext';
import { Navigate, Link } from 'react-router-dom';
import '../styles/login.css';

const Login = () => {
  const { user, redirectToLogin } = useAuth();
  const { theme } = useContext(SettingsContext);

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
