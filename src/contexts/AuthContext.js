import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { markHadAccount } from '../services/accountFlag';
import { getUserTier, clearUserTier, getCurrentTier } from '../game/entitlements';

const HUB_URL = process.env.REACT_APP_HUB_URL || 'https://octonion.io';
const CALLBACK_URL = `${window.location.origin}/auth/callback`;

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Account tier (entitlements #39). Starts from the synchronous cache (localStorage
  // mirror or 'free') so gates render sensibly immediately; the real fetch resolves
  // once per session via getUserTier(). Held in state so the tree re-renders when the
  // tier lands and synchronous gates (isPremium/hasTier) get re-read.
  const [tier, setTier] = useState(getCurrentTier);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Signed in: resolve the account tier (memoised, at most one fetch per session).
    // Signed out: reset to 'free' and drop the mirror so the next account on this
    // device never inherits a stale tier.
    const syncTier = (session) => {
      if (session?.user) {
        getUserTier().then(setTier).catch(() => setTier('free'));
      } else {
        clearUserTier();
        setTier('free');
      }
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        if (session?.user) markHadAccount();
        syncTier(session);
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
        if (session?.user) markHadAccount();
        syncTier(session);
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
    tier,
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
