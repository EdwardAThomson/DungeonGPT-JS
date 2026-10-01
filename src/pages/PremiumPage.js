import { Link } from 'react-router-dom';
import { hasTier } from '../game/entitlements';
import { sendEvent } from '../services/telemetry';
import '../styles/redesign.css';

/**
 * PremiumPage: player-facing tier comparison for DungeonGPT accounts.
 *
 * Mounted at /premium with a /membership alias (App.js); linked from the main
 * nav since 2026-07-22 - billing is LIVE at the Octonion hub (Stripe Managed
 * Payments), so the Members CTA sends players to octonion.io/membership to
 * subscribe. Games never touch the payment provider (hub payments spec).
 *
 * Content source of truth: docs/private/PREMIUM_ACCOUNTS_PLAN.md (local, gitignored) ("Tier ladder").
 * Launch scope is Free + Members: Members is the purchasable highlight;
 * Premium and Elite render as roadmap-only (dimmed, not purchasable) because
 * they are backed by unbuilt content (ships, bigger maps).
 *
 * Redesign (#82 §12, step 5): restyled in place onto the shared .rd-page primitives
 * (page-header, price cards, band, final) in src/styles/redesign.css; the home page's
 * pricing teaser uses the same .price cards and links here.
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
    cta: { kind: 'play', label: 'Play as a guest', to: '/new-game' },
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
    badge: 'Launch tier',
    highlight: true,
    summary: 'Everything in Free Account, plus premium adventures.',
    benefits: [
      "AI storytelling on the members' model pool, with a generous monthly allowance",
      'Eldritch, desert and snow realms, each with their own campaigns and foes',
      'River cities: settlements grown around island districts',
      'Higher-tier campaigns for seasoned parties',
      'Unlocks in other octonion.io games as they ship',
    ],
    cta: { kind: 'external', label: 'Become a Member', href: 'https://octonion.io/membership' },
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$10',
    period: '/month',
    badge: 'Planned',
    roadmap: true,
    summary: 'Planned. Opens when its content is built.',
    benefits: [
      'A canal city at the river mouth, and its flagship campaign',
      'A larger premium AI allowance',
      'Sea-faring maps with ships',
      'Bigger world maps',
      'Higher starting levels for seasoned parties',
    ],
    cta: { kind: 'disabled', label: 'Not yet available' },
  },
  {
    id: 'elite',
    name: 'Elite',
    price: '$20',
    period: '/month',
    badge: 'Planned',
    roadmap: true,
    summary: 'Planned. Opens when its content is built.',
    benefits: [
      'Highest share of the premium AI pool',
      'Better ships and mounts',
      'The biggest world maps',
      'Custom quests with legendary items',
      'Level 5 starting templates',
    ],
    cta: { kind: 'disabled', label: 'Not yet available' },
  },
];

const FAQ = [
  {
    q: 'What happens when my premium AI allowance runs out?',
    a: "Play never stops. Responses simply continue from the free pool until the allowance refreshes, and the game tells you which pool answered. Your saves, heroes, and progress are never affected.",
  },
  {
    q: 'What happens to my saves if I cancel?',
    a: 'Your saves and characters are never taken away. Premium gates the creation of new premium content, never your existing games: a desert campaign you started as a member stays fully playable.',
  },
  {
    q: 'How do I subscribe?',
    a: 'Membership lives on your octonion.io account - one $5/month subscription covers DungeonGPT and every other Octonion game. Premium and Elite are on the roadmap and will open only once the features they promise actually exist in the game.',
  },
  {
    q: 'Do I need an account to play?',
    a: 'No. Guests can create heroes and play right away, with everything stored in the browser. A free account adds cross-device saves and AI narration.',
  },
];

const Tick = () => (
  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const TierCta = ({ cta }) => {
  switch (cta.kind) {
    case 'play':
      return (
        <Link to={cta.to} className="btn btn-ghost" onClick={() => sendEvent('play_click')}>
          {cta.label}
        </Link>
      );
    case 'link':
      return (
        <Link to={cta.to} className="btn btn-ghost">
          {cta.label}
        </Link>
      );
    case 'external':
      // Membership is bought at the Octonion hub (one subscription, every
      // game); same account, so players land signed-in-ready.
      return (
        <a className="btn btn-primary" href={cta.href}>
          {cta.label}
        </a>
      );
    default:
      return <span className="btn btn-disabled">{cta.label}</span>;
  }
};

const TierCard = ({ tier, isMemberPlus }) => (
  <div className={`price${tier.highlight ? ' feature' : ''}${tier.roadmap ? ' roadmap' : ''}`}>
    {tier.badge && (
      <span className={`price-badge ${tier.roadmap ? 'price-badge-muted' : 'price-badge-gold'}`}>{tier.badge}</span>
    )}
    <div className="tier">{tier.name}</div>
    <div className="cost">
      <span className="amt">{tier.price}</span>
      {tier.period && <span className="per"> {tier.period}</span>}
    </div>
    <p className="summary">{tier.summary}</p>
    <ul>
      {tier.benefits.map((benefit) => (
        <li key={benefit}><Tick /> {benefit}</li>
      ))}
    </ul>
    {tier.id === 'members' && isMemberPlus ? (
      <span className="btn btn-active" title="This tier is active on your account">
        {'✓'} Active on your account
      </span>
    ) : (
      <TierCta cta={tier.cta} />
    )}
  </div>
);

const PremiumPage = () => {
  // Light, real wiring (2026-07-06): a signed-in member should not see a dead
  // "Coming Soon" button for the tier they already hold.
  const isMemberPlus = hasTier('member');
  const liveTiers = TIERS.filter((t) => !t.roadmap);
  const roadmapTiers = TIERS.filter((t) => t.roadmap);
  return (
    <div className="rd-page rd-membership">
      <section
        className="page-header"
        style={{
          backgroundImage: "linear-gradient(rgba(14,13,19,.7), rgba(14,13,19,.9)), url('/assets/templates/heroic-fantasy-t2.webp')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="wrap">
          <div className="crumb"><Link to="/">← Home</Link></div>
          <p className="eyebrow">Membership</p>
          <h1>Support the adventure.</h1>
          <p className="lede">
            DungeonGPT is free to play. Membership unlocks premium adventures and
            helps keep the Dungeon Master's lantern lit.
          </p>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow purple">Live now</p>
            <h2>Play free, or join Members.</h2>
            <p>No opaque credits. Start as a guest, sign in to sync and unlock the AI Dungeon Master, and become a member for premium realms and storytelling.</p>
          </div>
          <div className="price-row">
            {liveTiers.map((t) => <TierCard key={t.id} tier={t} isMemberPlus={isMemberPlus} />)}
          </div>
          <p className="price-note">One octonion.io membership covers DungeonGPT and every other Octonion game.</p>
        </div>
      </section>

      <section className="band band-alt">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow purple">On the roadmap</p>
            <h2>Higher tiers open when their content exists.</h2>
            <p>Premium and Elite are not on sale. They become purchasable only once the ships, maps and campaigns they promise are actually in the game.</p>
          </div>
          <div className="price-row price-row-2">
            {roadmapTiers.map((t) => <TierCard key={t.id} tier={t} isMemberPlus={isMemberPlus} />)}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Questions</p>
            <h2>Billing, saves and allowances.</h2>
          </div>
          <div className="faq-grid">
            {FAQ.map((item) => (
              <div key={item.q} className="faq">
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band band-alt">
        <div className="wrap final">
          <p className="eyebrow">Your table is ready</p>
          <h2>Try a campaign first. Decide later.</h2>
          <p>Everything above the Members line is free, and no account is needed to start.</p>
          <Link to="/new-game" className="btn btn-primary" onClick={() => sendEvent('play_click')}>Start free</Link>
        </div>
      </section>
    </div>
  );
};

export default PremiumPage;
