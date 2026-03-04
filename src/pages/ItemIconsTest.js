import React, { useState } from 'react';
import { ITEM_CATALOG } from '../utils/inventorySystem';

const ItemIconsTest = () => {
    const [iconSize, setIconSize] = useState(32);
    const [selectedImage, setSelectedImage] = useState(null);

    const itemsWithIcons = Object.entries(ITEM_CATALOG).filter(([key, item]) => item.icon);
    const itemsWithoutIcons = Object.entries(ITEM_CATALOG).filter(([key, item]) => !item.icon);

    const getRarityColor = (rarity) => {
        const colors = {
            common: '#9d9d9d',
            uncommon: '#1eff00',
            rare: '#0070dd',
            very_rare: '#a335ee',
            legendary: '#ff8000'
        };
        return colors[rarity] || colors.common;
    };

    return (
        <div style={{ padding: '20px', color: 'var(--text)' }}>
            <h2>Item Icons Debug</h2>
            <p>Test the generated icons here. Use the slider to test different sizes. Click an icon to view it in full resolution.</p>

            <div style={{ marginBottom: '20px' }}>
                <label>
                    <strong>Icon Size: {iconSize}px</strong>
                    <br />
                    <input
                        type="range"
                        min="16"
                        max="128"
                        value={iconSize}
                        onChange={(e) => setIconSize(Number(e.target.value))}
                        style={{ width: '200px' }}
                    />
                </label>
            </div>

            <h3>Items with Icons</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '40px' }}>
                {itemsWithIcons.map(([key, item]) => (
                    <div key={key} style={{
                        padding: '8px',
                        background: 'var(--surface-light)',
                        borderRadius: '4px',
                        border: `1px solid ${getRarityColor(item.rarity)}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer'
                    }}
                        onClick={() => setSelectedImage({ src: `/${item.icon}`, name: item.name })}
                        title="Click to enlarge"
                    >
                        <img
                            src={`/${item.icon}`}
                            alt={item.name}
                            loading="lazy"
                            style={{
                                width: `${iconSize}px`,
                                height: `${iconSize}px`,
                                objectFit: 'contain',
                                borderRadius: '4px',
                                background: 'rgba(0,0,0,0.2)'
                            }}
                        />
                        <span style={{ color: getRarityColor(item.rarity) }}>{item.name}</span>
                    </div>
                ))}
                {itemsWithIcons.length === 0 && <p>No icons generated yet.</p>}
            </div>

            <h3>Items Pending Icons</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {itemsWithoutIcons.map(([key, item]) => (
                    <div key={key} style={{
                        padding: '8px',
                        background: 'var(--surface-light)',
                        borderRadius: '4px',
                        border: `1px solid ${getRarityColor(item.rarity)}`
                    }}>
                        <span style={{ color: getRarityColor(item.rarity) }}>{item.name}</span>
                    </div>
                ))}
            </div>

            {selectedImage && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10000,
                        cursor: 'pointer'
                    }}
                    onClick={() => setSelectedImage(null)}
                >
                    <img
                        src={selectedImage.src}
                        alt={selectedImage.name}
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '80vh',
                            objectFit: 'contain',
                            background: '#2c3e50',
                            padding: '16px',
                            borderRadius: '8px',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                        }}
                    />
                    <h2 style={{ color: 'white', marginTop: '20px' }}>{selectedImage.name}</h2>
                    <p style={{ color: '#aaa' }}>Click anywhere to close</p>
                </div>
            )}
        </div>
    );
};

export default ItemIconsTest;
