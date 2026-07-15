import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { redeemCode } from '../services/redemptionApi';
import AiPoolPills from '../components/AiPoolPills';

// Friendly copy for the redeem endpoint's error contract (redemptionApi.js).
// 'code_invalid' is deliberately one line for every dead-code flavour (unknown,
// expired, disabled, fully claimed): the server does not say which, so a scanner
// cannot probe, and the copy has to cover all of them honestly.
const REDEEM_ERROR_COPY = {
  code_invalid: 'That code is not valid. Check it for typos; it may also have expired or been fully claimed.',
  already_redeemed: 'You have already redeemed this code on this account.',
  rate_limited: 'Too many attempts today. Please try again tomorrow.',
};
const REDEEM_ERROR_FALLBACK = 'Something went wrong redeeming the code. Please try again later.';

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
};

const tierLabel = (tier) => (tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : '');

const Profile = () => {
  const { user, signOut, tier, tierExpiresAt, hubLifetimeTier, refreshTier } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  // { kind: 'success', tier, expiresAt } | { kind: 'error', message }
  const [redeemResult, setRedeemResult] = useState(null);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    navigate('/');
  };

  const handleRedeem = async (e) => {
    e.preventDefault();
    if (!codeInput.trim() || redeeming) return;
    setRedeeming(true);
    setRedeemResult(null);
    try {
      const { tier: grantedTier, expiresAt } = await redeemCode(codeInput.trim());
      // Re-resolve entitlements the same way sign-in does, so tier gates unlock
      // immediately without a re-login. Best effort: the grant is already stored
      // server-side, so a refresh hiccup only delays the UI, never the membership.
      try {
        await refreshTier();
      } catch {
        // Next sign-in resolves the fresh tier anyway.
      }
      setRedeemResult({ kind: 'success', tier: grantedTier, expiresAt });
      setCodeInput('');
    } catch (err) {
      setRedeemResult({
        kind: 'error',
        message: REDEEM_ERROR_COPY[err?.code] || REDEEM_ERROR_FALLBACK,
      });
    } finally {
      setRedeeming(false);
    }
  };

  if (!user) {
    return (
      <div className="page-container">
        <h1>Profile</h1>
        <p>You need to be logged in to view this page.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1>Profile</h1>
      
      <div className="profile-card">
        <div className="profile-avatar-large">
          {user.email?.charAt(0).toUpperCase() || '?'}
        </div>
        
        <div className="profile-info">
          <h2>Account Details</h2>
          
          <div className="profile-field">
            <label>Email</label>
            <p>{user.email}</p>
          </div>
          
          <div className="profile-field">
            <label>Account Created</label>
            <p>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
          
          <div className="profile-field">
            <label>Last Sign In</label>
            <p>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Unknown'}</p>
          </div>

          <div className="profile-field">
            <label>Account ID</label>
            {/* The game's records are keyed by this id, not by email (identity
                lives in the auth hub). Players quote it for support or
                membership grants: the maintainer matches it in the admin
                panel (maintainer request 2026-07-06). */}
            <p>
              <code
                style={{ fontSize: '0.8rem', cursor: 'pointer', userSelect: 'all', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px' }}
                title="Click to copy"
                onClick={(e) => {
                  navigator.clipboard?.writeText(user.id);
                  const el = e.target;
                  const prev = el.textContent;
                  el.textContent = 'copied!';
                  setTimeout(() => { el.textContent = prev; }, 1200);
                }}
              >
                {user.id}
              </code>
            </p>
          </div>

          <div className="profile-field">
            <label>Membership</label>
            {/* Tier resolves from the entitlements service (#39); 'free' is also the
                honest answer while the fetch is pending or unreachable. Doubles as the
                sanity check that the account-tier chain works end to end. */}
            <p>
              {tier === 'elite' && <span className="tier-badge tier-elite">👑 Elite</span>}
              {tier === 'premium' && <span className="tier-badge tier-premium">💎 Premium</span>}
              {tier === 'member' && <span className="tier-badge tier-member">🔱 Member</span>}
              {(!tier || tier === 'free') && (
                <span className="tier-badge tier-free">⚡ Free <span className="tier-note">· Membership coming soon</span></span>
              )}
              {/* A lifetime hub grant (Founder unlock / grandfathered tester) has no
                  end date, so it beats a local grant's expiry — showing "active
                  until" a date SHORTER than what the player owns spooks them. Only
                  when the lifetime rung IS the displayed rung, though: a higher
                  time-boxed local grant (say Premium-until-August on top of
                  lifetime Member) still shows its honest end date. */}
              {tier && tier !== 'free' && hubLifetimeTier === tier ? (
                <span className="tier-note"> · lifetime</span>
              ) : (
                /* Time-boxed grants (redeemed codes, #6) carry an end date; stored
                   tiers do not, so the row stays as before for them. */
                tier && tier !== 'free' && tierExpiresAt && formatDate(tierExpiresAt) && (
                  <span className="tier-note"> · active until {formatDate(tierExpiresAt)}</span>
                )
              )}
            </p>
          </div>

          <div className="profile-field">
            <label>AI narration</label>
            {/* Members pick their pool here too, not only from the in-game AI tab
                (maintainer 2026-07-07). Shares the aiPool service with the game, so
                the choice is one and the same. */}
            <AiPoolPills style={{ marginTop: '4px' }} />
          </div>

          <div className="profile-field">
            <label htmlFor="redeem-code-input">Redeem a code</label>
            <form className="redeem-form" onSubmit={handleRedeem}>
              <input
                id="redeem-code-input"
                type="text"
                placeholder="XXXX-XXXX-XXXX"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                disabled={redeeming}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" disabled={redeeming || !codeInput.trim()}>
                {redeeming ? 'Redeeming...' : 'Redeem'}
              </button>
            </form>
            <p className="redeem-hint">
              Have a playtest or promo code? Redeem it here to activate membership time.
            </p>
            {redeemResult?.kind === 'success' && (
              <p className="redeem-status redeem-success" role="status">
                Code redeemed: {tierLabel(redeemResult.tier)} unlocked.
                {formatDate(redeemResult.expiresAt)
                  ? ` Membership active until ${formatDate(redeemResult.expiresAt)}.`
                  : ''}
              </p>
            )}
            {redeemResult?.kind === 'error' && (
              <p className="redeem-status redeem-error" role="alert">
                {redeemResult.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="profile-actions">
        <button 
          onClick={handleSignOut}
          className="signout-btn"
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      <style>{`
        .profile-card {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 30px;
          max-width: 500px;
          margin: 20px 0;
        }

        .tier-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 0.95rem;
          background: var(--bg);
          border: 1px solid var(--border);
        }
        .tier-member { border-color: #2e8b57; color: #2e8b57; }
        .tier-premium { border-color: #4169e1; color: #4169e1; }
        .tier-elite { border-color: #b8860b; color: #b8860b; }
        .tier-note { font-weight: 400; font-size: 0.8rem; color: var(--text-secondary); }

        .redeem-form {
          display: flex;
          gap: 8px;
          margin: 4px 0;
        }
        .redeem-form input {
          flex: 1;
          min-width: 0;
          padding: 6px 10px;
          font-family: var(--font-ui);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: var(--bg);
          color: var(--text);
          border: 1px solid var(--border);
          border-radius: 4px;
        }
        .redeem-form button {
          padding: 6px 16px;
        }
        .redeem-hint {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin: 4px 0 0;
        }
        .redeem-status {
          font-size: 0.85rem;
          margin: 8px 0 0;
        }
        .redeem-success { color: #2e8b57; }
        .redeem-error { color: var(--state-danger); }

        .profile-avatar-large {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background-color: var(--primary);
          color: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-header);
          font-size: 2rem;
          font-weight: bold;
          margin-bottom: 20px;
        }

        .profile-info h2 {
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 1.2rem;
        }

        .profile-field {
          margin-bottom: 15px;
        }

        .profile-field label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .profile-field p {
          margin: 0;
          font-family: var(--font-ui);
          color: var(--text);
        }

        .profile-actions {
          margin-top: 30px;
        }

        .signout-btn {
          background-color: transparent;
          color: var(--state-danger);
          border-color: var(--state-danger);
        }

        .signout-btn:hover:not(:disabled) {
          background-color: var(--state-danger);
          color: white;
        }
      `}</style>
    </div>
  );
};

export default Profile;
