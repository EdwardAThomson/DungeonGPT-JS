import { Link } from 'react-router-dom';
import '../styles/premium.css';

/**
 * PremiumPage: player-facing tier comparison for DungeonGPT accounts.
 *
 * DRAFT: currently mounted at /debug/premium only (DebugRoutes is gated out of
 * production builds). Its future home is a public /premium route in App.js once
 * billing ships; promoting it should just be moving the route.
 *
 * Content source of truth: docs/PREMIUM_ACCOUNTS_PLAN.md ("Tier ladder").
 * Launch scope is Free + Members: Members is the purchasable highlight;
 * Premium and Elite render as roadmap-only (dimmed, not purchasable) because
 * they are backed by unbuilt content (ships, housing, bigger maps).
 * No billing is wired: the Members CTA is a disabled "Coming soon" placeholder.
 */

const TIERS = [
  {
    id: 'guest',
    name: 'Guest',
    price: 'Free',
    period: null,
    summary: 'Jump straight in, no account needed.',
    benefits: [
      'Full core game: heroes, campaigns, world exploration',
      'Heroes and saves stored in your browser',
      'Built-in narration for exploring the world',
    ],
    cta: { kind: 'none', label: 'No sign-up needed' },
  },
  {
    id: 'free-account',
    name: 'Free Account',
    price: 'Free',
    period: null,
    summary: 'Everything in Guest, plus your adventures follow you.',
    benefits: [
      'Saves and heroes synced across your devices',
      'AI Dungeon Master narration (shared free pool)',
      'One octonion.io account across our games',
    ],
    cta: { kind: 'link', label: 'Sign Up Free', to: '/login' },
  },
  {
    id: 'members',
    name: 'Members',
    price: '$5',
    period: '/month',
    badge: 'Launch Tier',
    highlight: true,
    summary: 'Everything in Free Account, plus premium adventures.',
    benefits: [
      'Premium AI model pool for richer storytelling',
      'Sand and snow campaigns, each with its own music',
      'Custom quests that can reward rare items',
      'Higher-tier campaign content for seasoned parties',
      'Unlocks in other octonion.io games as they ship',
    ],
    cta: { kind: 'placeholder', label: 'Coming Soon' },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$10',
    period: '/month',
    badge: 'Roadmap: coming later',
    roadmap: true,
    summary: 'Planned. Opens when its content is built.',
    benefits: [
      'Greater share of the premium AI pool',
      'Sea-faring maps with ships',
      'Bigger world maps',
      'Custom quests with very rare items',
      'Higher starting levels and player housing',
    ],
    cta: { kind: 'disabled', label: 'Not yet available' },
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$20',
    period: '/month',
    badge: 'Roadmap: coming later',
    roadmap: true,
    summary: 'Planned. Opens when its content is built.',
    benefits: [
      'Highest share of the premium AI pool',
      'Better ships and mounts',
      'The biggest world maps',
      'Custom quests with legendary items',
      'Level 5 starting templates and grander housing',
    ],
    cta: { kind: 'disabled', label: 'Not yet available' },
  },
];

const FAQ = [
  {
    q: 'What happens to my saves if I cancel?',
    a: 'Your saves and characters are never taken away. Premium gates the creation of new premium content, never your existing games: a desert campaign you started as a member stays fully playable.',
  },
  {
    q: 'When can I subscribe?',
    a: 'Members is the first paid tier and opens soon. Premium and Elite are on the roadmap and will open only once the features they promise actually exist in the game.',
  },
  {
    q: 'Do I need an account to play?',
    a: 'No. Guests can create heroes and play right away, with everything stored in the browser. A free account adds cross-device saves and AI narration.',
  },
];

const TierCta = ({ cta }) => {
  switch (cta.kind) {
    case 'link':
      return (
        <Link to={cta.to} className="premium-cta secondary-cta">
          {cta.label}
        </Link>
      );
    case 'placeholder':
      return (
        <button
          type="button"
          className="premium-cta primary-cta"
          disabled
          title="Billing is not live yet"
        >
          {cta.label}
        </button>
      );
    case 'disabled':
      return (
        <button type="button" className="premium-cta disabled-cta" disabled>
          {cta.label}
        </button>
      );
    default:
      return <div className="premium-cta none-cta">{cta.label}</div>;
  }
};

const PremiumPage = () => (
  <div className="premium-container">
    <header className="premium-header">
      <h1>Support the Adventure</h1>
      <p className="premium-tagline">
        DungeonGPT is free to play. Membership unlocks premium adventures and
        helps keep the Dungeon Master's lantern lit.
      </p>
    </header>

    <div className="premium-tier-grid">
      {TIERS.map((tier) => (
        <div
          key={tier.id}
          className={[
            'premium-tier-card',
            tier.highlight ? 'highlight' : '',
            tier.roadmap ? 'roadmap' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {tier.badge && <div className="premium-tier-badge">{tier.badge}</div>}
          <h2 className="premium-tier-name">{tier.name}</h2>
          <div className="premium-tier-price">
            <span className="amount">{tier.price}</span>
            {tier.period && <span className="period">{tier.period}</span>}
          </div>
          <p className="premium-tier-summary">{tier.summary}</p>
          <ul className="premium-tier-benefits">
            {tier.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <TierCta cta={tier.cta} />
        </div>
      ))}
    </div>

    <section className="premium-faq">
      <h2>Questions</h2>
      {FAQ.map((item) => (
        <div key={item.q} className="premium-faq-item">
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </div>
      ))}
    </section>
  </div>
);

export default PremiumPage;
