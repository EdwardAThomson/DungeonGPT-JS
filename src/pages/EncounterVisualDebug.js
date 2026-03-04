import React, { useState } from 'react';
import { encounterTemplates } from '../data/encounters';
import EncounterModal from '../components/EncounterModal';
import EncounterActionModal from '../components/EncounterActionModal';

const EncounterVisualDebug = () => {
    const [selectedEncounterKey, setSelectedEncounterKey] = useState(Object.keys(encounterTemplates)[0]);
    const [modalType, setModalType] = useState('discovery'); // 'discovery' or 'action'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [customDescription, setCustomDescription] = useState('');
    const [forceImage, setForceImage] = useState(true);
    const [fullSizeImage, setFullSizeImage] = useState(false);
    const [testImage, setTestImage] = useState('/assets/encounters/goblin_ambush.webp');

    const encounter = encounterTemplates[selectedEncounterKey];

    // Create a modified encounter for testing
    const testEncounter = {
        ...encounter,
        description: customDescription || encounter.description,
        image: forceImage ? testImage : encounter.image
    };

    // Sample hero for Action Modal
    const sampleHero = {
        characterId: 'debug-hero',
        characterName: 'Debug Hero',
        heroName: 'Debug Hero',
        heroClass: 'Fighter',
        level: 5,
        currentHP: 45,
        maxHP: 50,
        profilePicture: '/assets/characters/fighter.webp',
        stats: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 10, charisma: 10 }
    };

    const sampleParty = [sampleHero];

    return (
        <div className="page-container" style={{ padding: '20px' }}>
            <h1>🎭 Encounter Visual Debug</h1>
            <p>Test how encounter modals render with different content and images.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                <div className="card" style={{ padding: '20px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <h3>Encounter Settings</h3>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Select Encounter:</label>
                        <select
                            value={selectedEncounterKey}
                            onChange={(e) => setSelectedEncounterKey(e.target.value)}
                            style={{ width: '100%', padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                        >
                            {Object.keys(encounterTemplates).map(key => (
                                <option key={key} value={key}>{encounterTemplates[key].name} ({key})</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Modal Type:</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setModalType('discovery')}
                                className={modalType === 'discovery' ? 'primary-button' : 'secondary-button'}
                                style={{ flex: 1 }}
                            >
                                Discovery Modal
                            </button>
                            <button
                                onClick={() => setModalType('action')}
                                className={modalType === 'action' ? 'primary-button' : 'secondary-button'}
                                style={{ flex: 1 }}
                            >
                                Action Modal
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Force Test Image:</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                                type="checkbox"
                                checked={forceImage}
                                onChange={(e) => setForceImage(e.target.checked)}
                            />
                            <input
                                type="text"
                                value={testImage}
                                onChange={(e) => setTestImage(e.target.value)}
                                style={{ flex: 1, padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                                placeholder="Image path..."
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Image Display Mode:</label>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={() => setFullSizeImage(false)}
                                className={!fullSizeImage ? 'primary-button' : 'secondary-button'}
                                style={{ flex: 1 }}
                            >
                                Cinematic Banner
                            </button>
                            <button
                                onClick={() => setFullSizeImage(true)}
                                className={fullSizeImage ? 'primary-button' : 'secondary-button'}
                                style={{ flex: 1 }}
                            >
                                Almost Full Size
                            </button>
                        </div>
                    </div>

                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px' }}>Custom Description (Test Overflow):</label>
                        <textarea
                            value={customDescription}
                            onChange={(e) => setCustomDescription(e.target.value)}
                            rows={5}
                            style={{ width: '100%', padding: '8px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}
                            placeholder="Leave empty to use template description..."
                        />
                        <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                            <button onClick={() => setCustomDescription('Short description.')} className="secondary-button" style={{ fontSize: '10px', padding: '4px 8px' }}>Short</button>
                            <button onClick={() => setCustomDescription('This is a medium length description that should take up a few lines of space in the modal. It helps check if the text wraps correctly around other elements like the icon or the image.')} className="secondary-button" style={{ fontSize: '10px', padding: '4px 8px' }}>Medium</button>
                            <button onClick={() => setCustomDescription('This is a very long description. '.repeat(15))} className="secondary-button" style={{ fontSize: '10px', padding: '4px 8px' }}>Long (Overflow)</button>
                            <button onClick={() => setCustomDescription('')} className="secondary-button" style={{ fontSize: '10px', padding: '4px 8px' }}>Reset</button>
                        </div>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="primary-button"
                        style={{ width: '100%', padding: '15px', fontSize: '18px' }}
                    >
                        Launch {modalType === 'discovery' ? 'Discovery' : 'Action'} Modal
                    </button>
                </div>

                <div className="card" style={{ padding: '20px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <h3>Preview Data</h3>
                    <pre style={{ background: 'var(--bg)', padding: '15px', borderRadius: '4px', overflow: 'auto', maxHeight: '500px', fontSize: '12px' }}>
                        {JSON.stringify(testEncounter, null, 2)}
                    </pre>
                </div>
            </div>

            {/* Modals */}
            {isModalOpen && (
                modalType === 'discovery' ? (
                    EncounterModal ? (
                        <EncounterModal
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                            encounter={testEncounter}
                            fullSizeImage={fullSizeImage}
                            onAction={(action) => console.log('Action selected:', action)}
                        />
                    ) : (
                        <div style={{ color: 'red', padding: '20px', border: '1px solid red' }}>
                            Error: EncounterModal component is undefined!
                        </div>
                    )
                ) : (
                    EncounterActionModal ? (
                        <EncounterActionModal
                            isOpen={isModalOpen}
                            onClose={() => setIsModalOpen(false)}
                            encounter={testEncounter}
                            character={sampleHero}
                            party={sampleParty}
                            fullSizeImage={fullSizeImage}
                            onResolve={(result) => {
                                console.log('Encounter resolved:', result);
                                setIsModalOpen(false);
                            }}
                            onCharacterUpdate={(hero) => console.log('Hero updated:', hero)}
                        />
                    ) : (
                        <div style={{ color: 'red', padding: '20px', border: '1px solid red' }}>
                            Error: EncounterActionModal component is undefined!
                        </div>
                    )
                )
            )}
        </div>
    );
};

export default EncounterVisualDebug;
