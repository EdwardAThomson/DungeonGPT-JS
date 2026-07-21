import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { markHadAccount } from '../services/accountFlag';
import {
  getUserTier,
  refreshUserTier,
  clearUserTier,
  getCurrentTier,
  getTierExpiresAt,
  getHubLifetimeGameTier,
} from '../game/entitlements';
import { loadPremiumTemplates, clearPremiumTemplates } from '../services/premiumContentApi';
import { autoSelectPoolForTier } from '../services/aiPool';
import { localHeroStore } from '../services/localHeroStore';
import { sendEvent } from '../services/telemetry';

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
  // End date of the grant backing the tier when it comes from a redeemed code (#6);
  // null for stored tiers and free accounts. Display metadata for the Profile page.
  const [tierExpiresAt, setTierExpiresAt] = useState(null);
  // Game-ladder tier the hub holds for life (Founder-style unlock or grandfathered
  // tester), or null. Display metadata: Profile prefers "lifetime" over a local
  // grant's shorter expiry when this matches the displayed tier.
  const [hubLifetimeTier, setHubLifetimeTier] = useState(null);
  // Premium content delivery (#40). True once this session's server-delivered
  // templates are registered into storyTemplates. The state flip matters even when
  // the tier value itself is unchanged (localStorage warm start): setTier alone would
  // bail out on Object.is equality and consumers rendering off the storyTemplates
  // array (NewGame's picker) would never re-read it.
  const [premiumContentReady, setPremiumContentReady] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    // Signed in: resolve the account tier (memoised, at most one fetch per session),
    // then load the server-delivered premium templates (#40; also memoised, never
    // rejects) BEFORE publishing the tier, so the state update that re-renders
    // consumers (NewGame reads the storyTemplates array during render) happens after
    // the delivered templates are registered.
    // Signed out: reset to 'free', drop the tier mirror and the premium-content
    // session cache, so the next account on this device never inherits either.
    const syncTier = (session) => {
      if (session?.user) {
        getUserTier()
          .then((resolvedTier) => loadPremiumTemplates().then(() => resolvedTier))
          .then((resolvedTier) => {
            setTier(resolvedTier);
            setTierExpiresAt(getTierExpiresAt());
            setHubLifetimeTier(getHubLifetimeGameTier());
            autoSelectPoolForTier(); // membership visibly delivers premium AI (2026-07-07)
            setPremiumContentReady(true);
          })
          .catch(() => setTier('free'));
      } else {
        clearUserTier();
        clearPremiumTemplates();
        setPremiumContentReady(false);
        setTier('free');
        setTierExpiresAt(null);
        setHubLifetimeTier(null);
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
        if (_event === 'SIGNED_IN') {
          // Funnel: sign-in completed. Supabase v2 emits INITIAL_SESSION (not
          // SIGNED_IN) for restored sessions, and telemetry dedupes per page
          // load, so this approximates real conversions. guestHeroes marks
          // whether the browser had a guest roster to bring along.
          let guestHeroes = false;
          try { guestHeroes = localHeroStore.hasHeroes(); } catch (e) { /* ignore */ }
          sendEvent('signin_completed', { guestHeroes }, { once: true });
        }
        syncTier(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const redirectToLogin = () => {
    window.location.href = `${HUB_URL}/auth/login?redirect=${encodeURIComponent(CALLBACK_URL)}`;
  };

  // Re-resolve the tier mid-session, the same way sign-in does (tier fetch, then the
  // premium-template delivery, then publish state so gates re-render). Used after a
  // successful code redemption (#6) so the new membership unlocks without re-login.
  const refreshTier = async () => {
    const resolvedTier = await refreshUserTier();
    clearPremiumTemplates();
    await loadPremiumTemplates();
    setTier(resolvedTier);
    setTierExpiresAt(getTierExpiresAt());
    setHubLifetimeTier(getHubLifetimeGameTier());
    autoSelectPoolForTier(); // a redeemed code upgrades the pool on the spot
    setPremiumContentReady(true);
    return resolvedTier;
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
    tierExpiresAt,
    hubLifetimeTier,
    premiumContentReady,
    refreshTier,
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
