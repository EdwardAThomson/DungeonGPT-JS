// HomePage.js

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { heroesApi } from "../services/heroesApi";
import { createLogger } from "../utils/logger";

const logger = createLogger('home-page');

const HomePage = () => {
  const { user } = useAuth();
  // Drives where "Start Adventure" goes: players with no hero are sent to create
  // one first (the real step 1) rather than jumping straight into game setup.
  const [hasHeroes, setHasHeroes] = useState(false);

  useEffect(() => {
    if (!user) { setHasHeroes(false); return; }
    let cancelled = false;
    heroesApi.list()
      .then((list) => { if (!cancelled) setHasHeroes(Array.isArray(list) && list.length > 0); })
      .catch((error) => logger.error('Failed to check heroes for Start Adventure routing:', error));
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="Home-page main-card">
      <div className="hero-section">
        <h1>DungeonGPT</h1>
        <p className="subtitle">Handcrafted campaigns, brought to life by AI</p>
      </div>

      <div className="home-navigation">
        <Link to={hasHeroes ? "/new-game" : "/hero-creation"} className="home-nav-card primary-card" data-tour="start-adventure">
          <div className="card-icon">⚔️</div>
          <div className="card-content">
            <h3>Start Adventure</h3>
            <p>{hasHeroes ? "Begin a new story with your party" : "Create your first hero, then begin"}</p>
          </div>
        </Link>

        <div className="home-grid">
          <Link to="/how-to-play" className="home-nav-card">
            <div className="card-icon">📚</div>
            <div className="card-content">
              <h3>How to Play</h3>
              <p>Learn the basics</p>
            </div>
          </Link>

          <Link to="/hero-creation" className="home-nav-card">
            <div className="card-icon">🧙‍♂️</div>
            <div className="card-content">
              <h3>Create Hero</h3>
              <p>Forge a new legend</p>
            </div>
          </Link>

          <Link to="/all-heroes" className="home-nav-card">
            <div className="card-icon">📜</div>
            <div className="card-content">
              <h3>Hall of Heroes</h3>
              <p>View your collection</p>
            </div>
          </Link>

          <Link to="/saved-conversations" className="home-nav-card">
            <div className="card-icon">📖</div>
            <div className="card-content">
              <h3>Chronicles</h3>
              <p>Resume your journeys</p>
            </div>
          </Link>
        </div>

        {!user && (
          <Link to="/login" className="home-nav-card mobile-sign-in-card">
            <div className="card-icon">🔑</div>
            <div className="card-content">
              <h3>Sign In</h3>
              <p>Save your progress across devices</p>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
};

export default HomePage;
