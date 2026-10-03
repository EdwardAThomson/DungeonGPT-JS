// GettingStarted: "How to Play" (#82 §12 step 5), the practical manual. The home page sells,
// Overview shows, the Engine page proves; this page explains how to actually play. Every
// instruction here was checked against the game code on 2026-10-01 (movement, checks, rests,
// saves); update it when those systems change. The FAQ moved here from the retired /features
// page. No screenshots of in-game UI: the game workspace is being redesigned (#84), so the one
// screenshot slot is a placeholder until then. Styles: .rd-page in src/styles/redesign.css.

import React from "react";
import { Link } from "react-router-dom";
import { sendEvent } from "../services/telemetry";
import "../styles/redesign.css";

// Line icons for the tip cards, drawn in the same gold "mark" squares as the Engine ruleset.
const ICONS = {
  chat: <><path d="M4 5h16v11H7l-3 3z" /><path d="M8 10h8M8 13h5" /></>,
  hook: <><rect x="3" y="14" width="8" height="6" rx="2" /><rect x="13" y="14" width="8" height="6" rx="2" /><path d="M4 4h16v6H4z" /></>,
  dice: <><rect x="2" y="7" width="12" height="12" rx="2" /><path d="M10 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6" /><circle cx="6" cy="11" r=".6" /><circle cx="10" cy="15" r=".6" /><circle cx="18" cy="7" r=".6" /></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>,
  map: <><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z" /><path d="M8 2v16M16 6v16" /></>,
  walk: <><circle cx="13" cy="4" r="2" /><path d="M9 21l3-7 3 3v4" /><path d="M7 11l3-3 4 1 3 3" /></>,
  door: <><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" /><path d="M2 21h20" /><circle cx="15" cy="12" r=".8" /></>,
  flag: <><path d="M4 22V3" /><path d="M4 4h13l-3 4 3 4H4" /></>,
  swords: <><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6M16 16l4 4M19 21l2-2" /><path d="M9.5 6.5L13 3h3v3l-3.5 3.5" /></>,
  run: <><circle cx="14" cy="4" r="2" /><path d="M4 22l4-7 4 2 2-6 4 4h4" /><path d="M8 11l3-3h4" /></>,
  layers: <><path d="M12 2l10 5-10 5L2 7z" /><path d="M2 12l10 5 10-5" /><path d="M2 17l10 5 10-5" /></>,
  bed: <><path d="M2 20V6" /><path d="M2 14h20v6" /><path d="M22 14v-3a3 3 0 0 0-3-3h-8v6" /><circle cx="6.5" cy="10.5" r="1.8" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />,
  shield: <><path d="M12 2l7 4v6c0 4-3 7-7 10-4-3-7-6-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  star: <polygon points="12 2 15 9 22 9.3 16.5 14 18.5 21 12 17 5.5 21 7.5 14 2 9.3 9 9" />,
  coins: <><ellipse cx="9" cy="6" rx="6" ry="3" /><path d="M3 6v5c0 1.7 2.7 3 6 3s6-1.3 6-3V6" /><path d="M9 17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3" /></>,
  sword: <><path d="M14.5 17.5L3 6V3h3l11.5 11.5" /><path d="M13 19l6-6M16 16l4 4M19 21l2-2" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>
);

const Tips = ({ items }) => (
  <div className={`rules-grid${items.length === 4 ? " two" : ""}`}>
    {items.map((t) => (
      <div key={t.k} className="rule">
        <div className="mark"><Icon name={t.icon} /></div>
        <div className="k">{t.k}</div>
        <div className="v">{t.v}</div>
      </div>
    ))}
  </div>
);

const ArtStrip = ({ items }) => (
  <div className="fight-grid even">
    {items.map((a) => (
      <figure key={a.label} className="fight">
        <div className="art" style={{ backgroundImage: `url('${a.img}')`, backgroundPosition: a.pos || "center" }} />
        <figcaption>{a.label}<span className="sub">{a.sub}</span></figcaption>
      </figure>
    ))}
  </div>
);

const TURN = [
  { icon: "chat", k: "Say what you do", v: "Type an action in plain English, like \"ask the innkeeper about the road west\", and the AI Dungeon Master narrates what happens. Free-text actions need a free account; guests explore with built-in narration." },
  { icon: "hook", k: "Or pick a suggestion", v: "When the story offers a hook, suggested actions appear as buttons under the scene. Click one instead of typing." },
  { icon: "dice", k: "Skill checks roll themselves", v: "If an action needs a roll, the engine rolls it on the spot with your hero's modifiers. You see the dice, the total and the target." },
  { icon: "shield", k: "A failed check stays failed", v: "You can't retry the same approach on the same person straight away. Try something different, take a long rest, or move on to another town." },
  { icon: "book", k: "Check the Journal", v: "Your current objective, side quests, your party, and every creature and item you have discovered so far." },
  { icon: "save", k: "Saved as you go", v: "The game autosaves every 30 seconds, and there is a Save button whenever you want one." },
];

const TRAVEL = [
  { icon: "map", k: "Travel the world map", v: "Open the Map and click a neighbouring tile to move there, diagonals included. Any step on the road can turn into an encounter." },
  { icon: "walk", k: "Walk around town", v: "Towns and sites open into their own maps. Click any tile you can reach and the party walks there." },
  { icon: "door", k: "Go inside", v: "Get within three tiles of a building to see what it is and step in. Once found, you can open it from anywhere in town. Inside are the people who work there." },
  { icon: "flag", k: "Follow the objectives", v: "Campaign locations appear on the world map once you have earned them, so the map grows as the story does." },
];

const FIGHT = [
  { icon: "swords", k: "Choose your lead", v: "With more than one hero, you pick who leads each fight. About one time in seven, initiative slips and another hero has to step up." },
  { icon: "layers", k: "Longer fights, whole party", v: "Bosses and tougher foes fight over several rounds. Everyone else in the party backs up the lead with a support bonus." },
  { icon: "run", k: "Run if you must", v: "When a fight can hurt you, you can try to flee. It works seven times in ten." },
  { icon: "bed", k: "Rest in town", v: "Resting is free. A tavern restores half your health; a night at the inn restores all of it and clears your failed checks." },
  { icon: "heart", k: "Revive the fallen", v: "Temples bring a fallen hero back at half health, for 25 gold per level." },
  { icon: "shield", k: "No game over", v: "If the whole party falls, kindly strangers carry you to the nearest town and you wake at half health." },
];

const PROGRESS = [
  { icon: "star", k: "Level up", v: "Heroes earn XP from fights and quests, up to level 20. A solo lead keeps a fight's XP; team fights share it; quest rewards go to every hero." },
  { icon: "coins", k: "Buy and sell", v: "The party shares one purse. Shops sell gear to your lead hero and buy items back at half their value." },
  { icon: "sword", k: "Equip anyone", v: "Each hero has a weapon, armour and accessory slot, and any hero can equip anything the party is carrying." },
];

const FAQ = [
  { q: "Do I need to know D&D rules?", a: <>No. The rules are 5e-inspired, but the engine applies them for you: rolls, modifiers, damage and loot. You just describe what you do. <Link className="learn" to="/engine">How the engine works</Link></> },
  { q: "Do I need an account?", a: "No. Guests can make heroes, start campaigns and explore, with progress saved in this browser. A free account adds the AI Dungeon Master and keeps your heroes and saves on every device." },
  { q: "Can the AI cheat or fudge a roll?", a: "No. Dice, combat and rewards are decided by the engine in code before the AI writes a word. The AI only narrates the result." },
  { q: "Which AI models does it use?", a: <>Free accounts use open-weights models (GPT-OSS and Llama) run on Cloudflare. Members can switch to the members' pool of stronger commercial models. <Link className="learn" to="/membership">Membership</Link></> },
  { q: "Can I play with friends?", a: "Not yet. DungeonGPT is single-player, but you can lead a party of up to four heroes." },
  { q: "Where are my saved games?", a: "Under Your Games in the menu, where you can pick up any campaign. Guest saves stay in this browser; sign in to keep them across devices." },
];

const GettingStarted = () => (
  <div className="rd-page rd-guide">
    {/* PAGE HEADER */}
    <section
      className="page-header"
      style={{
        backgroundImage: "linear-gradient(rgba(14,13,19,.7), rgba(14,13,19,.9)), url('/assets/buildings/town_interior_hero.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="wrap">
        <div className="crumb"><Link to="/">← Home</Link></div>
        <p className="eyebrow">How to play</p>
        <h1>Everything you need for your first game.</h1>
        <p className="lede">The engine handles the rules, so you don't need to know any. Here is how a game works, from your first hero to the final boss.</p>
      </div>
    </section>

    {/* FIRST GAME */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">01</span> Your first game</p>
          <h2>Three steps, about a minute.</h2>
        </div>
        <div className="first-steps">
          <article className="first-step">
            <div className="flow-num">1</div>
            <h3>Pick a campaign</h3>
            <p>Choose a story. Heroic Fantasy is a good first one. A world is generated for your game around it.</p>
            <Link to="/new-game" className="btn btn-primary" onClick={() => sendEvent("play_click")}>Play now</Link>
          </article>
          <article className="first-step">
            <div className="flow-num">2</div>
            <h3>Choose your party</h3>
            <p>Take a ready-made hero in one click, or build your own: twelve classes, 27 points across six ability scores. Bring one to four heroes.</p>
            <Link to="/hero-creation" className="btn btn-ghost">Create a hero</Link>
          </article>
          <article className="first-step">
            <div className="flow-num">3</div>
            <h3>Start the adventure</h3>
            <p>Guests play straight away. Sign in free to type your own actions to the AI Dungeon Master.</p>
            <Link to="/login" className="btn btn-ghost">Sign in free</Link>
          </article>
        </div>
      </div>
    </section>

    {/* PLAYING A TURN */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple"><span className="step-num">02</span> Playing a turn</p>
          <h2>You say what you do. The engine decides. The AI tells the story.</h2>
        </div>
        <div className="shot-placeholder" role="img" aria-label="Screenshot placeholder">
          <span>Screenshot: the game screen</span>
          <small>Coming with the new game layout</small>
        </div>
        <Tips items={TURN} />
      </div>
    </section>

    {/* GETTING AROUND */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">03</span> Getting around</p>
          <h2>One tile at a time across the world, anywhere you like in town.</h2>
        </div>
        <Tips items={TRAVEL} />
      </div>
    </section>

    {/* FIGHTS & RECOVERY */}
    <section className="band band-alt">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple"><span className="step-num">04</span> Fights and recovery</p>
          <h2>Pick your lead, back them up, and know where to heal.</h2>
        </div>
        <Tips items={FIGHT} />
        <ArtStrip items={[
          { label: "Tavern", sub: "Short rest, half health", img: "/assets/buildings/tavern.webp" },
          { label: "Inn", sub: "Long rest, full health", img: "/assets/buildings/inn.webp" },
          { label: "Temple", sub: "Revive the fallen", img: "/assets/buildings/temple.webp" },
        ]} />
      </div>
    </section>

    {/* PROGRESS */}
    <section className="band">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow"><span className="step-num">05</span> Progress</p>
          <h2>Levels, gold and gear.</h2>
        </div>
        <Tips items={PROGRESS} />
        <ArtStrip items={[
          { label: "Your heroes", sub: "Up to level 20", img: "/assets/characters/female_fighter.webp", pos: "center 22%" },
          { label: "Market", sub: "Buy and sell", img: "/assets/buildings/market.webp" },
          { label: "Blacksmith", sub: "Weapons and armour", img: "/assets/buildings/blacksmith.webp" },
        ]} />
      </div>
    </section>

    {/* FAQ */}
    <section className="band band-alt" id="faq">
      <div className="wrap">
        <div className="section-head">
          <p className="eyebrow purple">Questions</p>
          <h2>Frequently asked.</h2>
        </div>
        <div className="faq-grid">
          {FAQ.map((f) => (
            <div key={f.q} className="faq">
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="band">
      <div className="wrap final">
        <p className="eyebrow">Ready?</p>
        <h2>Your first campaign is a minute away.</h2>
        <p>No download, nothing to install, no account needed to start.</p>
        <div className="hero-actions" style={{ maxWidth: "22rem", marginInline: "auto" }}>
          <Link to="/new-game" className="btn btn-primary" onClick={() => sendEvent("play_click")}>Play now</Link>
          <Link to="/overview" className="btn btn-ghost">See what a session looks like</Link>
        </div>
      </div>
    </section>
  </div>
);

export default GettingStarted;
