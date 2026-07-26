import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hasTier } from '../game/entitlements';
import { getPreferredPool, setPreferredPool, subscribeAiPool } from '../services/aiPool';

// Shared Free/Premium AI pool pills (backlog #7). Used in the in-game AI settings
// (src/components/Modals.js) AND the Profile page (maintainer 2026-07-07: a member
// should be able to see and set their pool from Profile, not only mid-game). One
// component so the two surfaces can never drift; it reads/writes the same aiPool
// service, so a change on either surface reflects on the other.

const SELECTED = {
  flex: 1, padding: '10px 12px', borderRadius: '8px',
  border: '2px solid var(--primary)', background: 'var(--surface)',
  color: 'var(--primary)', fontWeight: 700, cursor: 'default',
};
const UNSELECTED = {
  flex: 1, padding: '10px 12px', borderRadius: '8px',
  border: '2px solid var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', fontWeight: 400, cursor: 'pointer',
};
const LOCKED = {
  flex: 1, padding: '10px 12px', borderRadius: '8px',
  border: '2px dashed var(--border)', background: 'transparent',
  color: 'var(--text-secondary)', opacity: 0.65, cursor: 'not-allowed',
};

const AiPoolPills = ({ style }) => {
  const premiumUnlocked = hasTier('member');
  const [pool, setPool] = useState(getPreferredPool());

  // Stay in sync with the other surface (and the tier auto-bump) while mounted.
  useEffect(() => subscribeAiPool(() => setPool(getPreferredPool())), []);

  const premiumActive = premiumUnlocked && pool === 'premium';

  return (
    <div style={style}>
    <div style={{ display: 'flex', gap: '8px' }} role="radiogroup" aria-label="AI pool">
      <button
        type="button"
        role="radio"
        aria-checked={!premiumActive}
        onClick={() => setPreferredPool('free')}
        style={!premiumActive ? SELECTED : UNSELECTED}
      >
        ⚡ Free AI
        <div style={{ fontSize: '0.72rem', fontWeight: 400, color: 'var(--text-secondary)', marginTop: '2px' }}>
          Cloudflare open-weights pool, included for everyone
        </div>
      </button>
      {premiumUnlocked ? (
        <button
          type="button"
          role="radio"
          aria-checked={premiumActive}
          onClick={() => setPreferredPool('premium')}
          title="Premium AI: stronger models, included with Membership"
          style={premiumActive ? SELECTED : UNSELECTED}
        >
          ✨ Premium AI
          <div style={{ fontSize: '0.72rem', fontWeight: 400, marginTop: '2px' }}>
            Stronger models · included with Membership
          </div>
        </button>
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked="false"
          disabled
          title="Premium AI models arrive with Membership"
          style={LOCKED}
        >
          🔒 Premium AI
          <div style={{ fontSize: '0.72rem', fontWeight: 400, marginTop: '2px' }}>
            Stronger models · Members
          </div>
        </button>
      )}
    </div>
      {/* Contextual, non-intrusive nudge: shown only to non-members, right under
          the locked pool they just reached for. Links to the in-app Membership
          page (which explains the tiers and links out to checkout). */}
      {!premiumUnlocked && (
        <Link
          to="/membership"
          style={{
            display: 'inline-block',
            marginTop: '8px',
            fontSize: '0.78rem',
            color: 'var(--primary)',
            textDecoration: 'none',
          }}
        >
          ✨ Unlock Premium AI with Membership →
        </Link>
      )}
    </div>
  );
};

export default AiPoolPills;
