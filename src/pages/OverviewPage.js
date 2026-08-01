// OverviewPage — "The Game" overview (#82 §12.4). The sell: what DungeonGPT actually is —
// a generated world threaded with an authored, milestone-tracked campaign, played by a party
// of real classes. Campaigns content is folded in here (not its own page). Styles: .rd-page.

import React from "react";
import { Link } from "react-router-dom";
import HomeWorldMap from "../components/HomeWorldMap";
import "../styles/redesign.css";

const Tick = () => (
  <svg className="tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
);

const OverviewPage = () => (
  <div className="rd-page">
    {/* PAGE HEADER — background scene + scrim (placeholder art, swap freely) */}
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
        <h1>A generated world, and a campaign that goes somewhere in it.</h1>
        <p className="lede">Every game rolls a seeded overworld of biomes, towns and points of interest, then threads an authored campaign through it, tracked as real milestones the engine can see. Not a chat box, a place.</p>
      </div>
    </section>

    {/* THE WORLD */}
    <section className="band">
      <div className="wrap">
        <div className="head-split">
          <div className="section-head">
            <p className="eyebrow purple">The world</p>
            <h2>Rolled fresh, rendered by the game's own tile art.</h2>
            <p>Roads, rivers, lakes, towns and mountains are placed by the real generator. Explore it a tile at a time; towns open into their own maps.</p>
          </div>
          <div className="head-map">
            <HomeWorldMap />
            <div className="map-caption">The real <code style={{ color: "var(--gold)" }}>generateMapData()</code> output, rendered with the game's own tile art.</div>
          </div>
        </div>
      </div>
    </section>

    {/* CAMPAIGNS / MILESTONES */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="head-split">
          <div className="section-head">
            <p className="eyebrow">Campaigns</p>
            <h2>An authored story, tracked as milestones the engine enforces.</h2>
            <p>Each campaign threads objectives through the world. The engine, not the model, decides when one is met, so the story can never quietly skip a beat.</p>
          </div>
          {/* placeholder: real campaign key art from the in-game roster; swap freely */}
          <div className="band-art" style={{ backgroundImage: "url('/assets/templates/heroic-fantasy-t1.webp')" }} role="img" aria-label="Campaign key art" />
        </div>
        <div className="chain" aria-label="Campaign milestone chain">
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Find the scout's map in the Willowdale tavern</div></div>
          <div className="step done"><div className="k"><Tick /> Cleared</div><div className="t">Meet Captain Ulric at the Briarwood militia hall</div></div>
          <div className="step active"><div className="k">◆ Active</div><div className="t">Track the raiders to their hideout in the Greenridge Hills</div></div>
          <div className="step locked"><div className="k">🔒 Locked</div><div className="t">Defeat the chieftain and end the raids</div></div>
        </div>
      </div>
    </section>

    {/* HEROES */}
    <section className="band">
      <div className="wrap">
        <div className="head-split">
          <div className="section-head">
            <p className="eyebrow">Your party</p>
            <h2>Twelve classes, and a character sheet with real numbers behind it.</h2>
            <p>Roll a hero, equip them, and watch the stats matter: every modifier on the sheet feeds the same engine that resolves your rolls.</p>
          </div>
          {/* placeholder art; swap freely */}
          <div className="band-art" style={{ backgroundImage: "url('/assets/buildings/town_interior_hero.webp')" }} role="img" aria-label="A hero in a town hall" />
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

    {/* CTA */}
    <section className="band band-alt">
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
