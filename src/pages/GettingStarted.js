import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/HowToPlay.css';

const GettingStarted = () => {
  const [selectedImage, setSelectedImage] = useState(null);

  const openImage = (src, alt) => {
    setSelectedImage({ src, alt });
  };

  const closeImage = () => {
    setSelectedImage(null);
  };

  return (
    <div className="how-to-play-container">
      <div className="how-to-play-content">
        <h1>Getting Started</h1>

        <section className="intro-section">
          <p className="intro-text">
            DungeonGPT is an AI-powered text-based RPG that brings the magic of tabletop
            role-playing games to your browser. Create heroes, embark on adventures, and
            let our AI Dungeon Master guide you through epic quests in a dynamic fantasy world.
          </p>
        </section>

        <section className="getting-started-section">
          <h2>🚀 Quick Start</h2>
          <ol className="steps-list">
            <li><strong>Create a Hero:</strong> Design your character — pick a class, race, stats, and backstory</li>
            <li><strong>Start a New Game:</strong> Choose a story template, set the tone, and select your party</li>
            <li><strong>Begin Your Quest:</strong> The AI Dungeon Master takes it from here</li>
          </ol>

          <div className="cta-buttons">
            <Link to="/hero-creation" className="cta-button primary">
              Create Your First Hero
            </Link>
            <Link to="/new-game" className="cta-button secondary">
              Start an Adventure
            </Link>
            <Link to="/login" className="cta-button tertiary">
              Sign In / Sign Up
            </Link>
          </div>
        </section>

        <section className="feature-section">
          <h2>🎮 Gameplay</h2>
          <div className="feature-content reverse">
            <div className="feature-text">
              <p>
                Once your adventure begins, you'll interact with the AI Dungeon Master through
                a chat-based interface. The game combines narrative storytelling with tactical
                decision-making.
              </p>
              <ul>
                <li><strong>Natural Language:</strong> Type what you want to do in plain English</li>
                <li><strong>AI Responses:</strong> The Dungeon Master narrates outcomes and presents choices</li>
                <li><strong>Conversation History:</strong> All your actions and story events are saved</li>
                <li><strong>Multiple Choice Options:</strong> Get suggested actions or write your own</li>
              </ul>
            </div>
            <div className="feature-image-placeholder">
              <img
                src="/assets/screenshots/chat_interface.webp"
                alt="Game Interface"
                className="feature-screenshot clickable-screenshot"
                onClick={() => openImage('/assets/screenshots/chat_interface.webp', 'Game Interface')}
                title="Click to enlarge"
              />
            </div>
          </div>
        </section>

        <section className="feature-section">
          <h2>🗺️ World Map & Exploration</h2>
          <div className="feature-content">
            <div className="feature-text">
              <ul>
                <li><strong>Procedurally Generated:</strong> Each adventure has a unique overworld map</li>
                <li><strong>Biomes:</strong> Explore forests, plains, mountains, beaches, and towns</li>
                <li><strong>Points of Interest:</strong> Discover caves, ruins, shrines, and more</li>
                <li><strong>Town Maps:</strong> Enter towns to find taverns, shops, temples, and NPCs</li>
                <li><strong>Click to Move:</strong> Navigate the world by clicking on adjacent tiles</li>
              </ul>
            </div>
            <div className="feature-image-placeholder gallery-placeholder" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="how-to-play-hero-container">
                <img
                  src="/assets/buildings/town_interior_hero.webp"
                  alt="Town Interior"
                  className="feature-screenshot hero-screenshot clickable-screenshot"
                  onClick={() => openImage('/assets/buildings/town_interior_hero.webp', 'Grand Inn')}
                  title="Click to enlarge"
                />
              </div>
              <div className="how-to-play-mini-gallery">
                <div className="mini-gallery-item">
                  <img src="/assets/buildings/tavern.webp" alt="Tavern" className="clickable-screenshot" onClick={() => openImage('/assets/buildings/tavern.webp', 'Tavern')} />
                  <span>Tavern</span>
                </div>
                <div className="mini-gallery-item">
                  <img src="/assets/buildings/blacksmith.webp" alt="Blacksmith" className="clickable-screenshot" onClick={() => openImage('/assets/buildings/blacksmith.webp', 'Blacksmith')} />
                  <span>Blacksmith</span>
                </div>
                <div className="mini-gallery-item">
                  <img src="/assets/buildings/temple.webp" alt="Temple" className="clickable-screenshot" onClick={() => openImage('/assets/buildings/temple.webp', 'Temple')} />
                  <span>Temple</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-section">
          <h2>⚔️ Encounters & Combat</h2>
          <div className="feature-content reverse">
            <div className="feature-text">
              <ul>
                <li><strong>Random Events:</strong> Encounter monsters, NPCs, and situations as you explore</li>
                <li><strong>Combat:</strong> Engage in turn-based battles with tactical choices</li>
                <li><strong>Skill Checks:</strong> Use your character's abilities to overcome challenges</li>
                <li><strong>Consequences:</strong> Your choices affect the story and your character's progression</li>
              </ul>
            </div>
            <div className="feature-image-placeholder">
              <img
                src="/assets/screenshots/bandit_encounter_modal.webp"
                alt="Encounter Modal"
                className="feature-screenshot clickable-screenshot"
                onClick={() => openImage('/assets/screenshots/bandit_encounter_modal.webp', 'Encounter Modal')}
                title="Click to enlarge"
              />
            </div>
          </div>
        </section>

        <section className="footer-section">
          <p>
            Want to learn more about what DungeonGPT offers?
          </p>
          <Link to="/features" className="back-link">View Features & FAQ →</Link>
        </section>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <div className="image-modal-overlay" onClick={closeImage}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={closeImage} aria-label="Close">
              ✕
            </button>
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="image-modal-img"
            />
            <p className="image-modal-caption">{selectedImage.alt}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GettingStarted;
