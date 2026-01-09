import React from 'react';

const BuildingModal = ({ building, npcs, onClose }) => {
    if (!building) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div
                className="modal-content building-modal"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: '400px', width: '90%', border: '2px solid #8b4513' }}
            >
                <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                    <h2 style={{ color: '#8b4513', marginBottom: '5px' }}>
                        {building.buildingName || building.buildingType.charAt(0).toUpperCase() + building.buildingType.slice(1)}
                    </h2>
                    <div style={{ fontSize: '12px', color: '#666', fontStyle: 'italic' }}>
                        Type: {building.buildingType} | Location: ({building.x}, {building.y})
                    </div>
                </div>

                <div className="modal-section">
                    <h4 style={{ borderBottom: '1px solid #ddd', paddingBottom: '5px' }}>Inhabitants & Workers</h4>
                    {npcs.length > 0 ? (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '10px 0' }}>
                            {npcs.map(npc => (
                                <li key={npc.id} style={{
                                    padding: '8px',
                                    borderBottom: '1px dashed #eee',
                                    display: 'flex',
                                    flexDirection: 'column'
                                }}>
                                    <span style={{ fontWeight: 'bold' }}>{npc.name}</span>
                                    <span style={{ fontSize: '11px', color: '#555' }}>
                                        {npc.job || npc.title || 'Resident'}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p style={{ fontStyle: 'italic', color: '#888', textAlign: 'center' }}>No one seems to be here right now.</p>
                    )}
                </div>

                <button
                    className="secondary-button"
                    onClick={onClose}
                    style={{ width: '100%', marginTop: '10px' }}
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default BuildingModal;
