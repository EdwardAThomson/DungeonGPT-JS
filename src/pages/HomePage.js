// HomePage.js

import React from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const HomePage = () => {
  const { user } = useAuth();

  return (
    <div className="Home-page main-card">
      <div className="hero-section">
        <h1>DungeonGPT</h1>
        <p className="subtitle">Handcrafted campaigns, brought to life by AI</p>
      </div>

      <div className="home-navigation">
        {/* Adventure-first: hero-less players are no longer detoured to the blank
            creation form — the party page offers ready-made heroes (and creation)
            as step 2, after an adventure is chosen. */}
        <Link to="/new-game" className="home-nav-card primary-card" data-tour="start-adventure">
          <div className="card-icon">⚔️</div>
          <div className="card-content">
            <h3>Start Adventure</h3>
            <p>Choose an adventure and begin your story</p>
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
