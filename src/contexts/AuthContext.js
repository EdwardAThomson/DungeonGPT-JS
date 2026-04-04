import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const HUB_URL = process.env.REACT_APP_HUB_URL || 'https://octonion.io';
const CALLBACK_URL = `${window.location.origin}/auth/callback`;

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.error('Failed to get session:', err);
      })
      .finally(() => {
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const redirectToLogin = () => {
    window.location.href = `${HUB_URL}/auth/login?redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  const signOut = async () => {
    if (!supabase) {
      return { error: null };
    }
    const { error } = await supabase.auth.signOut();
    // Optionally redirect to hub logout for global sign-out
    window.location.href = `${HUB_URL}/auth/logout?redirect=${encodeURIComponent(window.location.origin)}`;
    return { error };
  };

  const value = {
    user,
    loading,
    redirectToLogin,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
