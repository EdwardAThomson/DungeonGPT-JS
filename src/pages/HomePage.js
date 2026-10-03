// HomePage.js: redesign (#82 §12.3). The public front page, the same page for everyone so
// a shared link shows what the visitor will see. Signed-in players only get a different
// primary CTA ("Continue playing" -> /play); their dashboard lives at /play (PlayPage.js).
// Ported from docs/private/landing-mockup/index.html; styles in src/styles/redesign.css.
// KNOWN §12.3 follow-ups (branch-only): the hero d20 is static (animation later); the world
// map-card is a placeholder (live generateMapData render = §12.3c); the dashboard shows
// neutral copy rather than fake save data (real continue-campaign wiring = §12.3c, PlayPage).

import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { sendEvent } from "../services/telemetry";
import HomeWorldMap from "../components/HomeWorldMap";
import "../styles/redesign.css";

const HERO_IMG = "/assets/redesign/hero.jpg";
const GITHUB_URL = "https://github.com/EdwardAThomson/DungeonGPT-JS";
const COMBAT_URL = `${GITHUB_URL}/blob/master/src/utils/encounterResolver.js`;

const Tick = () => (
  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const FrontPage = ({ signedIn }) => (
  <>
    {/* HERO */}
    <section className="hero">
      <div className="hero-photo" style={{ backgroundImage: `url('${HERO_IMG}')` }} aria-hidden="true" />
      <div className="hero-scrim" aria-hidden="true" />
      <div className="hero-inner">
        <div className="hero-copy">
          <h1>The AI tells the story.<br /><span className="accent">The rules decide what happens.</span></h1>
          <div className="hero-actions">
            {signedIn
              ? <Link to="/play" className="btn btn-primary">Continue playing</Link>
              : <Link to="/new-game" className="btn btn-primary" data-tour="home-play" onClick={() => sendEvent('play_click')}>Play now</Link>}
            <Link to="/engine" className="btn btn-ghost">See how the engine works</Link>
          </div>
          {!signedIn && <p className="hero-note"><span className="dot" /> No sign-up to start · play instantly as a guest</p>}
        </div>

        {/* Option B: the die IS the roll (14); the math reads left-to-right as one equation,
            no duplicated "d20 14" label. Tag is "Skill check" until the roll animation lands
            (§12.3c), then it can become "Live". */}
        <div className="roll-card" aria-label="Example skill check: rolled 14, +5 modifiers, 19 versus difficulty 17, success — resolved in code">
          <div className="roll-head">
            <span className="roll-tag">Skill check</span>
            <span className="roll-quest">Persuade the harbor master</span>
          </div>
          <div className="roll-body">
            <div className="d20">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <polygon points="7,26 50,3 50,25 28,63" fill="#1c1728" stroke="#3a3350" strokeWidth="1" />
                <polygon points="50,3 93,26 72,63 50,25" fill="#181322" stroke="#3a3350" strokeWidth="1" />
                <polygon points="7,26 28,63 7,74" fill="#1f1a2c" stroke="#3a3350" strokeWidth="1" />
                <polygon points="93,26 93,74 72,63" fill="#1f1a2c" stroke="#3a3350" strokeWidth="1" />
                <polygon points="28,63 72,63 93,74 50,97 7,74" fill="#141019" stroke="#3a3350" strokeWidth="1" />
                <polygon points="50,25 72,63 28,63" fill="#241d33" stroke="#3a3350" strokeWidth="1" />
                <polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill="none" stroke="#d4af37" strokeWidth="1.4" opacity="0.55" />
              </svg>
              <span className="val">14</span>
            </div>
            <div className="roll-math">
              <div className="math-row">
                <span className="op">+</span>
                <span>modifiers <b>+5</b></span>
              </div>
              <div className="math-total">
                <span className="op">=</span>
                <span className="total-num">19</span>
                <span className="vs">vs DC 17</span>
                <span className="pill-success">Success</span>
              </div>
            </div>
          </div>
          <p className="roll-foot">Resolved by <span className="code">encounterResolver.js</span>, not the model.</p>
        </div>
      </div>
    </section>

    {/* WEDGE */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="head-split">
          <div className="section-head">
            <p className="eyebrow">Why trust it</p>
            <h2>Most AI game masters ask you to trust the dice. Ours run on rules you can read.</h2>
            <p>"The AI can't fudge outcomes" is the most-repeated promise in this category, and almost nowhere can you check it. Our rules engine is open source, so you can see how the game is designed to work.</p>
          </div>
          <div className="band-art" style={{ backgroundImage: "url('/assets/encounters/bandit_roadblock.webp')" }} role="img" aria-label="Bandits blocking a forest road" />
        </div>
        <div className="cards-3">
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg></div>
            <h3>Resolved in code</h3>
            <p>Combat and skill checks are computed in deterministic JavaScript. The combat path makes zero LLM calls. The model cannot inflate damage or move a hidden number.</p>
            <div className="foot">dice.js · encounterResolver.js</div>
          </article>
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 4v6c0 4-3 7-7 10-4-3-7-6-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg></div>
            <h3>Open source</h3>
            <p>The engine is Apache-2.0 and public. You can read the exact file that resolves every fight. No other shipped AI GM lets you check.</p>
            <div className="foot"><a href={COMBAT_URL} target="_blank" rel="noopener noreferrer">Read the combat resolver on GitHub →</a></div>
          </article>
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H7l-3 3z" /><path d="M8 10h8M8 13h5" /></svg></div>
            <h3>Narrated, not judged</h3>
            <p>Combat resolves with zero AI calls: the engine rolls, hits, and pays out on its own. The model only narrates the world around it, never the fight itself.</p>
            <div className="foot">engine referees · LLM narrates</div>
          </article>
        </div>
        <Link className="learn" to="/engine">Read how the engine resolves a turn</Link>
      </div>
    </section>

    {/* WORLD */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple">Not a chat box</p>
          <h2>A generated world, and a campaign that actually goes somewhere.</h2>
          <p>Every game rolls a seeded overworld of biomes, towns and points of interest, then threads an authored campaign through it, tracked as real milestones the engine can see.</p>
        </div>
        <div className="world-grid">
          <div className="scroll-card">
            <div className="who">In play · the harbor, dawn</div>
            <div className="prose">
              The harbor master's jaw tightens as your argument lands. For a long moment the gulls
              are the only sound. Then he exhales and slides the manifest across the salt-stained desk.{" "}
              <span className="say">"The Drowned Bells sailed on the morning tide,"</span> he mutters.{" "}
              <span className="say">"You didn't hear it from me."</span>
            </div>
            <div className="stamp"><span>◆</span> Persuasion check passed: <b>19 vs 17</b></div>
          </div>
          <div className="map-card">
            <HomeWorldMap />
            <div className="map-caption">The real <code style={{ color: "var(--gold)" }}>generateMapData()</code> output, rendered with the game's own tile art. Roads, rivers and the lake are placed by the actual generator, not staged.</div>
          </div>
        </div>

        <div className="chain" aria-label="Campaign milestone chain">
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Find the scout's map in the Willowdale tavern</div></div>
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Meet Captain Ulric at the Briarwood militia hall</div></div>
          <div className="step active"><div className="k">◆ Active</div><div className="t">Track the raiders to their hideout in the Greenridge Hills</div></div>
          <div className="step locked"><div className="k">🔒 Locked</div><div className="t">Defeat the chieftain and end the raids</div></div>
        </div>
        <Link className="learn" to="/overview">Explore the campaign &amp; milestone system</Link>
      </div>
    </section>

    {/* HEROES */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Forge a hero</p>
          <h2>Twelve classes, and a character sheet with real numbers behind it.</h2>
          <p>Roll a hero, equip them, and watch the stats matter: every modifier on the sheet feeds the same engine that resolves your rolls.</p>
        </div>
        <div className="heroes-row">
          <article className="hero-card"><div className="portrait" style={{ backgroundImage: "url('/assets/characters/fighter.webp')" }} /><div className="label"><div className="cls">Fighter</div></div></article>
          <article className="hero-card"><div className="portrait" style={{ backgroundImage: "url('/assets/characters/female_ranger.webp')" }} /><div className="label"><div className="cls">Ranger</div></div></article>
          <article className="hero-card"><div className="portrait" style={{ backgroundImage: "url('/assets/characters/wizard.webp')" }} /><div className="label"><div className="cls">Wizard</div></div></article>
          <article className="hero-card"><div className="portrait" style={{ backgroundImage: "url('/assets/characters/female_paladin.webp')" }} /><div className="label"><div className="cls">Paladin</div></div></article>
        </div>
        <p className="price-note">Class portraits from the in-game roster. Every hero is human; choose from twelve classes.</p>
      </div>
    </section>

    {/* PRICING */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple">Pricing</p>
          <h2>Playtime-legible. No opaque credits.</h2>
          <p>Play free on the house model pool, or join Members for premium AI storytelling and extra realms.</p>
        </div>
        <div className="price-row">
          <div className="price">
            <span className="price-badge price-badge-gold">Live now</span>
            <div className="tier">Free</div>
            <div className="cost"><span className="amt">$0</span></div>
            <ul>
              <li><Tick /> Full campaigns: heroes, world exploration, milestones, no account needed</li>
              <li><Tick /> Sign in free for the AI Dungeon Master (shared pool)</li>
              <li><Tick /> Saves and heroes synced across your devices</li>
            </ul>
            <Link to="/new-game" className="btn btn-ghost" onClick={() => sendEvent('play_click')}>Play now</Link>
          </div>
          <div className="price feature">
            <span className="price-badge price-badge-gold">Live now</span>
            <div className="tier">Members</div>
            <div className="cost"><span className="amt">$5</span> <span className="per">/ month</span></div>
            <ul>
              <li><Tick /> AI storytelling on the members' model pool, generous monthly allowance</li>
              <li><Tick /> Eldritch, desert and snow realms with their own campaigns and foes</li>
              <li><Tick /> River cities: settlements grown around island districts</li>
              <li><Tick /> Higher-tier campaigns for seasoned parties</li>
            </ul>
            <a href="https://octonion.io/membership" className="btn btn-primary" target="_blank" rel="noopener noreferrer">Become a Member</a>
          </div>
          <div className="price">
            <span className="price-badge price-badge-muted">Planned</span>
            <div className="tier">Premium</div>
            <div className="cost"><span className="amt">$10</span> <span className="per">/ month</span></div>
            <ul>
              <li><Tick /> A canal city at the river mouth, and its flagship campaign</li>
              <li><Tick /> A larger premium AI allowance</li>
              <li><Tick /> Sea-faring maps with ships, and bigger world maps</li>
            </ul>
            <span className="btn btn-disabled">Not open yet</span>
          </div>
        </div>
        <p className="price-note">
          One octonion.io membership covers DungeonGPT and every other Octonion game. <Link className="learn" style={{ marginTop: 0, display: "inline-flex" }} to="/membership">See the full membership page</Link>
        </p>
      </div>
    </section>

    {/* FINAL CTA */}
    <section className="band band-alt">
      <div className="wrap final">
        <p className="eyebrow">Your table is ready</p>
        <h2>The only dice you have to trust are your own.</h2>
        <p>Create a hero, roll a world, and start a campaign in under a minute. No download, nothing to install.</p>
        {signedIn
          ? <Link to="/play" className="btn btn-primary">Continue playing</Link>
          : <Link to="/new-game" className="btn btn-primary" onClick={() => sendEvent('play_click')}>Start free</Link>}
      </div>
    </section>
  </>
);

const HomePage = () => {
  const { user } = useAuth();
  return (
    <div className="rd-page rd-home">
      <FrontPage signedIn={!!user} />
    </div>
  );
};

export default HomePage;
