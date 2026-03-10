import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/HowToPlay.css';

const Features = () => {
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
        <h1>Features & FAQ</h1>

        <section className="feature-section">
          <h2>🎭 Character Creation</h2>
          <div className="feature-content reverse">
            <div className="feature-text">
              <p>
                Build your perfect hero from the ground up. Choose from classic D&D classes
                like Fighter, Wizard, Rogue, and Cleric, or explore unique options like
                Barbarian, Bard, Druid, and more.
              </p>
              <ul>
                <li><strong>12 Classic Classes:</strong> Each with unique abilities and playstyles</li>
                <li><strong>9 Playable Races:</strong> Human, Elf, Dwarf, Smallfolk, Dragonkin, Gnome, Half-Elf, Half-Orc, and Demonkin</li>
                <li><strong>Customizable Stats:</strong> Distribute points across Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma</li>
                <li><strong>Background & Personality:</strong> Define your character's backstory, traits, and motivations</li>
                <li><strong>Equipment & Skills:</strong> Start with class-appropriate gear and abilities</li>
              </ul>
              <p className="tip">
                <strong>Tip:</strong> Characters are saved to your account, so you can create
                multiple heroes and use them across different adventures!
              </p>
            </div>
            <div className="feature-image-placeholder">
              <img
                src="/assets/screenshots/character_creator_updated.webp"
                alt="Character Creation Interface"
                className="feature-screenshot clickable-screenshot"
                onClick={() => openImage('/assets/screenshots/character_creator_updated.webp', 'Character Creation Interface')}
                title="Click to enlarge"
              />
            </div>
          </div>
        </section>

        <section className="feature-section">
          <h2>🗺️ Adventure Creation</h2>
          <div className="feature-content">
            <div className="feature-text">
              <p>
                Every adventure is unique. Set up your campaign with customizable settings
                that shape the entire experience.
              </p>
              <ul>
                <li><strong>Story Templates:</strong> Choose from pre-made scenarios or create your own</li>
                <li><strong>Tone Settings:</strong> From lighthearted Noble adventures to dark Grimdark campaigns</li>
                <li><strong>Custom Locations:</strong> Name towns, mountains, and landmarks that will appear on your map</li>
                <li><strong>Quest Milestones:</strong> Set specific goals and objectives for your adventure</li>
                <li><strong>Party Selection:</strong> Choose which heroes will join the adventure</li>
                <li><strong>AI Model Selection:</strong> Pick from multiple AI models for different storytelling styles</li>
              </ul>
              <p className="tip">
                <strong>Tip:</strong> The AI will weave your custom locations and milestones into
                the narrative, creating a personalized story just for you!
              </p>
            </div>
            <div className="feature-image-placeholder">
              <img
                src="/assets/screenshots/adventure_creator.webp"
                alt="Adventure Setup Interface"
                className="feature-screenshot clickable-screenshot"
                onClick={() => openImage('/assets/screenshots/adventure_creator.webp', 'Adventure Setup Interface')}
                title="Click to enlarge"
              />
            </div>
          </div>
        </section>

        <section className="feature-section">
          <h2>🎒 Character Management</h2>
          <div className="feature-content reverse">
            <div className="feature-text">
              <ul>
                <li><strong>HP Tracking:</strong> Monitor your health during adventures</li>
                <li><strong>Inventory:</strong> Collect items, gold, and equipment</li>
                <li><strong>Party Members:</strong> View stats for all heroes in your party</li>
                <li><strong>Progression:</strong> Gain experience and level up through your journey</li>
              </ul>
            </div>
            <div className="feature-image-placeholder gallery-placeholder" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div className="how-to-play-mini-gallery">
                <div className="mini-gallery-item">
                  <img src="/assets/icons/items/legendary_weapon.webp" alt="Legendary Weapon" className="clickable-screenshot" onClick={() => openImage('/assets/icons/items/legendary_weapon.webp', 'Legendary Weapon')} />
                  <span>Weapons</span>
                </div>
                <div className="mini-gallery-item">
                  <img src="/assets/icons/items/greater_healing_potion.webp" alt="Healing Potion" className="clickable-screenshot" onClick={() => openImage('/assets/icons/items/greater_healing_potion.webp', 'Healing Potion')} />
                  <span>Potions</span>
                </div>
                <div className="mini-gallery-item">
                  <img src="/assets/icons/items/gold_coins.webp" alt="Gold Coins" className="clickable-screenshot" onClick={() => openImage('/assets/icons/items/gold_coins.webp', 'Gold Coins')} />
                  <span>Loot</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="feature-section">
          <h2>💾 Save & Load System</h2>
          <div className="feature-content">
            <div className="feature-text">
              <p>
                Your adventures are automatically saved and can be resumed at any time.
              </p>
              <ul>
                <li><strong>Auto-Save:</strong> Game state is saved after each action</li>
                <li><strong>Multiple Saves:</strong> Maintain different adventures simultaneously</li>
                <li><strong>Cloud Sync:</strong> Access your saves from any device (requires account)</li>
                <li><strong>Conversation Names:</strong> Give your adventures memorable names</li>
              </ul>
            </div>
            <div className="feature-image-placeholder">
              <img
                src="/assets/screenshots/saved_games.webp"
                alt="Saved Games"
                className="feature-screenshot clickable-screenshot"
                onClick={() => openImage('/assets/screenshots/saved_games.webp', 'Saved Games')}
                title="Click to enlarge"
              />
            </div>
          </div>
        </section>

        <section className="faq-section">
          <h2>❓ Frequently Asked Questions</h2>

          <div className="faq-item">
            <h3>Do I need to know D&D rules to play?</h3>
            <p>
              No! While DungeonGPT is inspired by D&D, the AI handles all the rules and
              mechanics behind the scenes. Just describe what you want to do, and the AI
              will take care of the rest.
            </p>
          </div>

          <div className="faq-item">
            <h3>Can I play with friends?</h3>
            <p>
              Currently, DungeonGPT is a single-player experience, but you can create
              multiple party members and control them all in your adventure.
            </p>
          </div>

          <div className="faq-item">
            <h3>What AI models are available?</h3>
            <p>
              We support multiple AI providers via CloudFlare Workers
              (Llama, DeepSeek, Mistral, and more). Exploring how to support models such
              as OpenAI GPT-5+, Google Gemini, Anthropic Claude.
            </p>
          </div>

          <div className="faq-item">
            <h3>Is my progress saved automatically?</h3>
            <p>
              Yes! Your game state is automatically saved after each action. You can also
              manually save and load games from the Saved Games menu.
            </p>
          </div>

          <div className="faq-item">
            <h3>Do I need an account?</h3>
            <p>
              You can create characters and plan adventures without an account, but signing
              up allows you to save your progress across devices and access cloud features.
            </p>
          </div>
        </section>

        <section className="footer-section">
          <p>
            Ready to start playing?
          </p>
          <Link to="/getting-started" className="back-link">← Getting Started Guide</Link>
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

export default Features;
