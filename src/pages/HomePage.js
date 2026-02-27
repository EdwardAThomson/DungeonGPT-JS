// HomePage.js

import React from "react";
import { Link } from "react-router-dom";

const HomePage = () => {
  return (
    <div className="Home-page main-card">
      <div className="hero-section">
        <h1>DungeonGPT</h1>
        <p className="subtitle">Enter the realm of infinite stories</p>
      </div>

      <div className="home-navigation">
        <Link to="/new-game" className="home-nav-card primary-card">
          <div className="card-icon">⚔️</div>
          <div className="card-content">
            <h3>Start Adventure</h3>
            <p>Begin a new story with your party</p>
          </div>
        </Link>

        <div className="home-grid">
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
      </div>
    </div>
  );
};

export default HomePage;
