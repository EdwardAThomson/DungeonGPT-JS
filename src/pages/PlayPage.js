// PlayPage.js: the player's dashboard at /play (#82). Split out of the front page so "/"
// is the same public page for everyone and sharing it shows what a visitor sees. Signing
// in lands here (AuthCallback) and the nav's Play button points here. Guests can open it
// too: their saves and heroes are local. The hero card is the newest save, loaded the same
// way Your Games loads one (getById, then /game with loadedConversation); with no saves it
// invites a first campaign. Styles: .rd-page / .rd-app in src/styles/redesign.css.

import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { conversationsApi } from "../services/conversationsApi";
import { resolveProfilePicture } from "../utils/assetHelper";
import { saveCardInfo, sortSavesNewestFirst, timeAgo } from "../game/saveCardInfo";
import { parseSaveRoot } from "../game/saveController";
import { createLogger } from "../utils/logger";
import "../styles/redesign.css";

const logger = createLogger("play-page");

const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

const PlayPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saves, setSaves] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [loadingGame, setLoadingGame] = useState(false);
  const name = user?.email ? user.email.split("@")[0] : null;

  useEffect(() => {
    let cancelled = false;
    conversationsApi.list()
      .then((rows) => { if (!cancelled) setSaves(sortSavesNewestFirst(rows)); })
      .catch((err) => {
        logger.error("Could not load saves:", err);
        if (!cancelled) { setSaves([]); setError(err.message); }
      });
    return () => { cancelled = true; };
  }, []);

  const latest = saves && saves.length ? saves[0] : null;
  const info = latest ? saveCardInfo(latest) : null;

  const continueLatest = async () => {
    if (!latest || loadingGame) return;
    setLoadingGame(true);
    try {
      const conversationData = await conversationsApi.getById(latest.sessionId);
      navigate("/game", {
        state: { loadedConversation: conversationData, selectedHeroes: conversationData.selected_heroes || [] },
      });
    } catch (err) {
      logger.error("Could not load save:", err);
      setError(err.message);
      setLoadingGame(false);
    }
  };

  return (
    <div className="rd-page rd-app">
      <section className="band">
        <div className="wrap">
          <p className="eyebrow">{name ? "Welcome back" : "Your table"}</p>
          <h1 className="play-title">Ready when you are{name ? `, ${name}` : ""}.</h1>

          <div className="dash-grid">
            {saves === null ? (
              <article className="play-feature loading" aria-busy="true"><p className="app-status">Loading your games...</p></article>
            ) : latest ? (
              <article className="play-feature" style={{ backgroundImage: `linear-gradient(90deg, rgba(14,13,19,.94) 0%, rgba(14,13,19,.72) 55%, rgba(14,13,19,.25) 100%), ${info.art}` }}>
                <div className="who">Continue your campaign</div>
                {/* Name only: the date is already in "Played ...". */}
                <h2>{info.settings?.saveName || (latest.conversation_name ? parseSaveRoot(latest.conversation_name) : "Untitled Adventure")}</h2>
                <p className="play-meta">
                  {info.settings?.templateName && <span>{info.settings.templateName}</span>}
                  {latest.timestamp && <span>Played {timeAgo(latest.timestamp)}</span>}
                </p>
                {info.heroes.length > 0 && (
                  <div className="play-party">
                    {info.heroes.slice(0, 4).map((h, i) => {
                      const heroName = h.heroName || h.characterName || "Unknown";
                      return h.profilePicture ? <img key={i} src={resolveProfilePicture(h.profilePicture)} alt={heroName} title={heroName} /> : null;
                    })}
                    <span>{info.heroes.map((h) => h.heroName || h.characterName || "Unknown").join(", ")}</span>
                  </div>
                )}
                {info.progress && (
                  <div className="save-progress">
                    <div className="save-progress-bar"><span style={{ width: `${Math.round((info.progress.completed.length / info.progress.total) * 100)}%` }} /></div>
                    <p>
                      <b>{info.progress.completed.length} of {info.progress.total}</b> objectives
                      {info.progress.current?.text && !info.settings?.campaignComplete ? <> · Next: {info.progress.current.text}</> : null}
                    </p>
                  </div>
                )}
                <div className="play-actions">
                  <button type="button" className="btn btn-primary" onClick={continueLatest} disabled={loadingGame}>
                    {loadingGame ? "Loading..." : "Continue"}
                  </button>
                  {saves.length > 1 && <Link to="/saved-conversations" className="btn btn-ghost">All {saves.length} games</Link>}
                </div>
              </article>
            ) : (
              <article className="play-feature" style={{ backgroundImage: "linear-gradient(90deg, rgba(14,13,19,.94) 0%, rgba(14,13,19,.7) 55%, rgba(14,13,19,.2) 100%), url('/assets/templates/heroic-fantasy-t1.webp')" }}>
                <div className="who">Your first campaign</div>
                <h2>Goblin raiders are attacking Willowdale.</h2>
                <p className="play-meta"><span>Heroic Fantasy · free</span></p>
                <p className="play-blurb">Pick a party, roll a world, and track the raiders to their hideout. About a minute to start.</p>
                <div className="play-actions">
                  <Link to="/new-game" className="btn btn-primary">Start a campaign</Link>
                </div>
              </article>
            )}

            <div className="quick">
              <Link to="/new-game" className="quick-item"><Icon d={<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>} /> New campaign</Link>
              <Link to="/saved-conversations" className="quick-item"><Icon d={<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>} /> Your games</Link>
              <Link to="/all-heroes" className="quick-item"><Icon d={<><path d="M17 21v-2a4 4 0 0 0-3-3.87" /><path d="M9 21v-2a4 4 0 0 1 3-3.87" /><circle cx="9" cy="7" r="4" /></>} /> Your heroes</Link>
              <Link to="/hero-creation" className="quick-item"><Icon d={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} /> Create a hero</Link>
              <Link to="/getting-started" className="quick-item"><Icon d={<><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></>} /> How to play</Link>
            </div>
          </div>
          {error && <p className="app-status error" style={{ marginTop: "1rem" }}>Couldn't load your games: {error}</p>}
        </div>
      </section>
    </div>
  );
};

export default PlayPage;
