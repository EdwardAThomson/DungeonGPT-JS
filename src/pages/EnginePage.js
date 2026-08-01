// EnginePage — "The Engine" determinism deep-dive (#82 §12.4). The credibility wedge:
// how every outcome is decided in open code, the real rollCheck() source, three pillars,
// an honest what-we-claim/don't section, and the custom ruleset. Ported from the mockup
// docs/private/landing-mockup/engine.html; styles in src/styles/redesign.css (.rd-page).

import React from "react";
import { Link } from "react-router-dom";
import "../styles/redesign.css";

const GITHUB_URL = "https://github.com/EdwardAThomson/DungeonGPT-JS";
const DICE_URL = `${GITHUB_URL}/blob/master/src/utils/dice.js`;

const Check = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const Cross = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
);

const EnginePage = () => (
  <div className="rd-page">
    {/* PAGE HEADER */}
    <section className="page-header">
      <div className="wrap">
        <div className="crumb"><Link to="/">← Home</Link></div>
        <p className="eyebrow">The Engine</p>
        <h1>How every outcome is decided. And how you can check.</h1>
        <p className="lede">In most AI game masters, the model decides what happens and you take its word for it. In DungeonGPT a structured rules engine decides, in code you can read, and the AI only writes the story around the result.</p>
      </div>
    </section>

    {/* THE TURN, RESOLVED */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">One turn, step by step</p>
          <h2>What happens when you try something.</h2>
          <p>Take a persuasion attempt. Here is the exact order of operations, and where the model is (and isn't) involved.</p>
        </div>

        <div className="world-grid">
          <div className="flow">
            <div className="flow-step">
              <div className="flow-num">1</div>
              <div>
                <h3>You act</h3>
                <p>"Persuade the harbor master to tell you where the ship sailed." The game reads your intent and the relevant skill.</p>
                <span className="tag muted">your input</span>
              </div>
            </div>
            <div className="flow-step engine">
              <div className="flow-num">2</div>
              <div>
                <h3>The engine rolls, in code</h3>
                <p>A real d20, plus your Charisma modifier and any support, against a difficulty the encounter set. Computed in JavaScript. No model call.</p>
                <span className="tag">deterministic · dice.js</span>
              </div>
            </div>
            <div className="flow-step engine">
              <div className="flow-num">3</div>
              <div>
                <h3>The outcome is decided</h3>
                <p>Pass or fail, any damage, any loot, all settled by the engine before a word of prose exists. This is the part the model cannot touch.</p>
                <span className="tag">encounterResolver.js</span>
              </div>
            </div>
            <div className="flow-step">
              <div className="flow-num">4</div>
              <div>
                <h3>The AI narrates it</h3>
                <p>The model is handed the result and writes the scene: the harbor master relents, or doesn't. It colors what happened. It never changes it.</p>
                <span className="tag muted">the model, at last</span>
              </div>
            </div>
          </div>

          <div className="roll-card" style={{ alignSelf: "start" }} aria-label="The resolved skill check the model was handed">
            <div className="roll-head">
              <span className="roll-tag">The result, before prose</span>
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
                  <polygon points="50,3 93,26 93,74 50,97 7,74 7,26" fill="none" stroke="var(--gold)" strokeWidth="1.4" opacity="0.55" />
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
            <p className="roll-foot">Every number here was fixed by the engine. The model receives this object and narrates from it.</p>
          </div>
        </div>
      </div>
    </section>

    {/* READ THE CODE */}
    <section className="band band-alt" id="source">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Not a promise, a file</p>
          <h2>This is the dice code. You can read it.</h2>
          <p>Every rival says "the AI can't fudge the dice." Here is the function that actually rolls them, from the open-source repo.</p>
        </div>
        <div className="code-block">
          <div className="code-head"><span className="dot" /><span className="dot" /><span className="dot" /> <span className="file">src/utils/dice.js</span></div>
          <pre>
<span className="cm">{"// A standard check: a real d20 plus your modifier."}</span>{"\n"}
<span className="kw">export const</span> <span className="fn">rollCheck</span> = (modifier = 0) =&gt; {"{"}{"\n"}
{"  "}<span className="kw">const</span> naturalRoll = <span className="fn">rollDie</span>(20);{"        "}<span className="cm">{"// Math.random-backed d20"}</span>{"\n"}
{"  "}<span className="kw">const</span> total = naturalRoll + modifier;{"  "}<span className="cm">{"// + ability and skill"}</span>{"\n"}
{"\n"}
{"  "}<span className="kw">return</span> {"{"}{"\n"}
{"    "}total,{"\n"}
{"    "}naturalRoll,{"\n"}
{"    "}isCriticalSuccess: naturalRoll === 20,{"  "}<span className="cm">{"// nat 20"}</span>{"\n"}
{"    "}isCriticalFailure: naturalRoll === 1,{"   "}<span className="cm">{"// nat 1"}</span>{"\n"}
{"  "}{"}"};{"\n"}
{"}"};
          </pre>
        </div>
        <p className="code-note">Lightly trimmed from the real <code>rollCheck()</code> (advantage/disadvantage handling elided for the page). The model appears nowhere in this path. <a className="learn" style={{ marginTop: 0, display: "inline-flex" }} href={DICE_URL} target="_blank" rel="noopener noreferrer">Read the full file on GitHub</a></p>
      </div>
    </section>

    {/* THREE PILLARS */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">Why it holds</p>
          <h2>Three things that are true here and almost nowhere else.</h2>
        </div>
        <div className="cards-3">
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg></div>
            <h3>Resolved in code</h3>
            <p>Combat and skill checks are computed in deterministic JavaScript. The combat path makes zero model calls: the engine rolls, applies damage, and pays out loot on its own.</p>
            <div className="foot">dice.js · encounterResolver.js · multiRoundEncounter.js</div>
          </article>
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l7 4v6c0 4-3 7-7 10-4-3-7-6-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg></div>
            <h3>Open source</h3>
            <p>The engine is Apache-2.0. The dice code is public. DungeonGPT is the only shipped AI GM where anyone can read exactly how checks and combat are resolved.</p>
            <div className="foot"><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">Apache-2.0 · auditable repo</a></div>
          </article>
          <article className="feat">
            <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H7l-3 3z" /><path d="M8 10h8M8 13h5" /></svg></div>
            <h3>Narrated, not judged</h3>
            <p>The model's whole job is prose. It is told what the engine decided, then writes the scene. Storytelling and integrity, kept firmly apart.</p>
            <div className="foot">engine referees · model narrates</div>
          </article>
        </div>
      </div>
    </section>

    {/* HONESTY */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple">Straight about the limits</p>
          <h2>What we claim, and what we don't.</h2>
          <p>A page about integrity should be honest about its own edges. Here is exactly what "you can verify it" does and doesn't mean today.</p>
        </div>
        <div className="claims">
          <div className="claim do">
            <h3>What is true today</h3>
            <ul>
              <li><Check /> Dice and combat are resolved in open code you can read.</li>
              <li><Check /> That code runs in your browser: you can open dev tools and watch a roll happen.</li>
              <li><Check /> The combat path makes no model calls at all, so nothing can quietly override it.</li>
            </ul>
          </div>
          <div className="claim dont">
            <h3>What we do not claim (yet)</h3>
            <ul>
              <li><Cross /> A cryptographic proof that the deployed build byte-for-byte matches the public source.</li>
              <li><Cross /> Per-roll "provably fair" verification. It's a natural next step, and on the roadmap, not shipped.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    {/* RULESET */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow">The ruleset</p>
          <h2>A custom d20 system. 5e-inspired, deliberately not the SRD.</h2>
        </div>
        <div className="rules-grid">
          <div className="rule"><div className="k">Six ability scores</div><div className="v">Str, Dex, Con, Int, Wis, Cha. Modifier = <code>(score − 10) / 2</code>.</div></div>
          <div className="rule"><div className="k">Checks vs DC</div><div className="v">d20 + modifier against a difficulty class the encounter sets.</div></div>
          <div className="rule"><div className="k">Advantage / disadvantage</div><div className="v">Roll twice, take the higher or the lower.</div></div>
          <div className="rule"><div className="k">Crits</div><div className="v">Natural 20 and natural 1 swing the outcome, win or lose.</div></div>
          <div className="rule"><div className="k">Multi-round bosses</div><div className="v">A lead hero rolls; the party adds support; enemy HP is a real knob.</div></div>
          <div className="rule"><div className="k">No hidden numbers</div><div className="v">Every modifier that touched a roll is shown in its breakdown.</div></div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="band band-alt">
      <div className="wrap final">
        <p className="eyebrow">See it for yourself</p>
        <h2>Play a turn, then go read the code that resolved it.</h2>
        <p>Both are free. One of them, no other shipped AI game master can offer.</p>
        <div className="hero-actions" style={{ maxWidth: "22rem", marginInline: "auto" }}>
          <Link to="/new-game" className="btn btn-primary">Start your first campaign</Link>
          <a href={GITHUB_URL} className="btn btn-ghost" target="_blank" rel="noopener noreferrer">Read the source on GitHub</a>
        </div>
      </div>
    </section>
  </div>
);

export default EnginePage;
