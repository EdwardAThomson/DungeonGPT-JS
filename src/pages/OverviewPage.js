// OverviewPage: "The Game" (#82 §12.4). A walkthrough of one session, start to finish:
// party → campaign → world → town → fights → milestones. The front page pitches and the
// Engine page proves; this page SHOWS, so it leans on the game's own art and live-rendered
// maps rather than repeating the home sections. Deliberately no screenshots of in-game UI
// chrome: the game workspace is being redesigned (#84), so everything here is either art
// or rendered through the real generators, and survives that change. Styles: .rd-page.

import React from "react";
import { Link } from "react-router-dom";
import HomeWorldMap from "../components/HomeWorldMap";
import HomeTownMap from "../components/HomeTownMap";
import "../styles/redesign.css";

const Tick = () => (
  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
);

const PARTY = [
  { cls: "Barbarian", img: "barbarian" },
  { cls: "Bard", img: "female_bard" },
  { cls: "Cleric", img: "cleric" },
  { cls: "Druid", img: "female_druid" },
  { cls: "Wizard", img: "female_wizard" },
  { cls: "Ranger", img: "ranger" },
];

const REALMS = [
  { name: "Heroic Fantasy", art: "heroic-fantasy-t1", tier: "Free", blurb: "Goblin raiders are attacking the farms around Willowdale. Track them to their hideout and end the raids." },
  { name: "Grimdark Survival", art: "grimdark-survival-t1", tier: "Free", blurb: "Ashford is dying: blackened crops, collapsing livestock, a foul smell from the old well. Find the source before winter." },
  { name: "Arcane Renaissance", art: "arcane-renaissance-t1", tier: "Free", blurb: "A haywire automaton is smashing up Cogsworth, and the artificer who built it has vanished from his workshop." },
  { name: "Desert Expedition", art: "desert-expedition-t1", tier: "Members", blurb: "The caravans out of Sandreach have stopped arriving, swallowed by the dunes and the robed figures who command the storms." },
  { name: "Frozen Frontier", art: "frozen-frontier-t1", tier: "Members", blurb: "Hearthmere is freezing to death, and something cold and patient stalks the drifts at night." },
  { name: "Eldritch Horror", art: "eldritch-horror-t1", tier: "Members", blurb: "Livestock vanish near Hollowmarsh, robed figures haunt the marsh, and a cult's ritual is nearly complete." },
];

const FIGHTS = [
  { label: "Goblin ambush", img: "goblin_ambush" },
  { label: "Giant spiders", img: "giant_spiders" },
  { label: "The Bandit King", img: "bosses/bandit_king", boss: true },
];

const OverviewPage = () => (
  <div className="rd-page rd-overview">
    {/* PAGE HEADER */}
    <section
      className="page-header"
      style={{
        backgroundImage: "linear-gradient(rgba(14,13,19,.68), rgba(14,13,19,.9)), url('/assets/redesign/hero.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="wrap">
        <div className="crumb"><Link to="/">← Home</Link></div>
        <p className="eyebrow">The game</p>
        <h1>One session, start to finish.</h1>
        <p className="lede">Build a party, pick a campaign, and set out across a world generated for your game. Here is what you will actually see along the way.</p>
      </div>
    </section>

    {/* 01 PARTY */}
    <section className="band">
      <div className="wrap head-split">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">01</span> Build your party</p>
          <h2>Twelve classes, with real numbers behind them.</h2>
          <p>Spend 27 points across six ability scores, or apply a class template and go. Every modifier on the sheet feeds the same engine that resolves your rolls. Take one hero, or a party of up to four.</p>
        </div>
        <div className="portrait-grid">
          {PARTY.map((h) => (
            <article key={h.cls} className="hero-card">
              <div className="portrait" style={{ backgroundImage: `url('/assets/characters/${h.img}.webp')` }} />
              <div className="label"><div className="cls">{h.cls}</div></div>
            </article>
          ))}
        </div>
      </div>
    </section>

    {/* 02 CAMPAIGN */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple"><span className="step-num">02</span> Pick a campaign</p>
          <h2>Six realms, each with its own story and foes.</h2>
          <p>Every campaign is authored: named towns, people to find, a villain at the end. Three are free; Members unlock the desert, the frozen north and the eldritch marshes.</p>
        </div>
        <div className="realm-grid">
          {REALMS.map((r) => (
            <article key={r.name} className="realm">
              <div className="art" style={{ backgroundImage: `url('/assets/templates/${r.art}.webp')` }}>
                <span className={`price-badge ${r.tier === "Free" ? "price-badge-gold" : "price-badge-muted"}`}>{r.tier}</span>
              </div>
              <div className="body">
                <h3>{r.name}</h3>
                <p>{r.blurb}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>

    {/* 03 WORLD */}
    <section className="band">
      <div className="wrap head-split">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">03</span> Travel the world</p>
          <h2>A map rolled for your game, not a backdrop.</h2>
          <p>Biomes, rivers, roads, towns and mountains come from a seeded generator, with your campaign's towns placed into it. Objectives stay hidden until you have earned them, then appear on the map.</p>
        </div>
        <div className="head-map">
          <HomeWorldMap seed={101} />
          <div className="map-caption">Rendered live by the game's own generator and tile art.</div>
        </div>
      </div>
    </section>

    {/* 04 TOWN */}
    <section className="band band-alt">
      <div className="wrap head-split reverse">
        <div className="head-map">
          <HomeTownMap seed={21} size="city" hasRiver name="Goldencaster" tile={20} />
          <div className="map-caption">A river city, generated the first time you arrive.</div>
        </div>
        <div className="section-head">
          <p className="eyebrow purple"><span className="step-num">04</span> Walk into town</p>
          <h2>Every town opens into a map of its own.</h2>
          <p>Streets, a market, the inn, the smithy, the temple. Walk to any building, step inside, and meet the people who work there: a quest giver, a merchant with real stock, a bed for the night.</p>
        </div>
      </div>
    </section>

    {/* 05 FIGHTS */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">05</span> Fight on the engine's terms</p>
          <h2>Ambushes on the road, bosses at the end of the trail.</h2>
          <p>Choose who leads, and the engine rolls the round: hits, damage and loot are settled in code before the AI writes a word of the scene. Bosses fight across several rounds, with the rest of the party in support.</p>
        </div>
        <div className="fight-grid">
          {FIGHTS.map((f) => (
            <figure key={f.label} className={`fight${f.boss ? " boss" : ""}`}>
              <div className="art" style={{ backgroundImage: `url('/assets/encounters/${f.img}.webp')` }} />
              <figcaption>{f.boss && <span className="price-badge price-badge-gold">Boss</span>}{f.label}</figcaption>
            </figure>
          ))}
        </div>
        <Link className="learn" to="/engine">See how a round is resolved</Link>
      </div>
    </section>

    {/* 06 MILESTONES */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple"><span className="step-num">06</span> See it through</p>
          <h2>A campaign that keeps track, so the story can't skip a beat.</h2>
          <p>Objectives unlock in order, and each one completes on something you actually did: an item found, a person met, a place reached, a fight won. Finish a campaign and its next chapter opens.</p>
        </div>
        <div className="chain" aria-label="Campaign milestone chain">
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Find the scout's map in the Willowdale tavern</div></div>
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Meet Captain Ulric at the Briarwood militia hall</div></div>
          <div className="step active"><div className="k">◆ Active</div><div className="t">Track the raiders to their hideout in the Greenridge Hills</div></div>
          <div className="step locked"><div className="k">🔒 Locked</div><div className="t">Defeat the chieftain and end the raids</div></div>
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="band">
      <div className="wrap final">
        <p className="eyebrow">Your table is ready</p>
        <h2>Roll a world and start a campaign in under a minute.</h2>
        <p>No download, nothing to install. Play as a guest; a free account adds the AI Dungeon Master.</p>
        <div className="hero-actions" style={{ maxWidth: "22rem", marginInline: "auto" }}>
          <Link to="/new-game" className="btn btn-primary">Play now</Link>
          <Link to="/engine" className="btn btn-ghost">See how the engine works</Link>
        </div>
      </div>
    </section>
  </div>
);

export default OverviewPage;
