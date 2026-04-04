import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

const HUB_URL = process.env.REACT_APP_HUB_URL || 'https://octonion.io';

const AuthCallback = () => {
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    async function handleCallback() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setError('No token received from hub');
        return;
      }

      if (!supabase) {
        setError('Authentication not configured');
        return;
      }

      // Exchange the OTT for a session via the hub
      try {
        const resp = await fetch(`${HUB_URL}/auth/exchange`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (!resp.ok) {
          const data = await resp.json().catch(() => ({}));
          setError(data.error || `Exchange failed (${resp.status})`);
          return;
        }

        const { access_token, refresh_token } = await resp.json();

        const { error: sessionError } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        // Success — go to home page
        navigate('/', { replace: true });
      } catch (err) {
        setError(err.message || 'Failed to complete authentication');
      }
    }

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text)' }}>
        <h2>Authentication Failed</h2>
        <p style={{ color: 'var(--danger, #ef4444)' }}>{error}</p>
        <a href="/" style={{ color: 'var(--link, #60a5fa)' }}>Go home</a>
      </div>
    );
  }

  return (
    <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text)' }}>
      <p>Completing authentication...</p>
    </div>
  );
};

export default AuthCallback;
