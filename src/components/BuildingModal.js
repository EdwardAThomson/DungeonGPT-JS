import React, { useState } from 'react';

const BuildingModal = ({ building, npcs, onClose }) => {
    const [imageError, setImageError] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    if (!building) return null;

    // Map building types to image names
    const getImageSrc = (type) => {
        const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
        return `/assets/buildings/${normalizedType}.webp`;
    };

    const imageSrc = getImageSrc(building.buildingType);

    const toggleLightbox = (e) => {
        if (e) e.stopPropagation();
        setIsLightboxOpen(!isLightboxOpen);
    };

    return (
        <>
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <div
                    className="modal-content building-modal"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        maxWidth: '780px', // 30% increase from 600px
                        width: '95%',
                        border: '3px solid var(--primary)',
                        padding: '0',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--text)',
                        boxShadow: '0 15px 40px var(--shadow)',
                        borderRadius: '12px'
                    }}
                >
                    {/* Header Section - Above the image */}
                    <div style={{ padding: '25px 25px 15px 25px', textAlign: 'center' }}>
                        <h2 style={{
                            color: 'var(--primary)',
                            margin: '0 0 8px 0',
                            fontSize: '2.2rem',
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            fontFamily: 'var(--header-font)'
                        }}>
                            {building.buildingName || building.buildingType.charAt(0).toUpperCase() + building.buildingType.slice(1)}
                        </h2>
                        <div style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            fontStyle: 'italic',
                            fontFamily: 'var(--body-font)'
                        }}>
                            {building.buildingType} | Location: ({building.x}, {building.y})
                        </div>
                    </div>

                    {/* Image Section */}
                    {!imageError && (
                        <div
                            style={{
                                width: 'calc(100% - 50px)',
                                height: '365px', // 30% increase from 280px
                                margin: '0 25px 20px 25px',
                                backgroundColor: '#000',
                                position: 'relative',
                                overflow: 'hidden',
                                borderRadius: '10px',
                                border: isHovered ? '3px solid var(--primary)' : '3px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                transform: isHovered ? 'scale(1.005)' : 'scale(1)',
                                boxShadow: isHovered ? '0 0 20px var(--primary)' : 'none'
                            }}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            onClick={toggleLightbox}
                            title="Click to view larger image"
                        >
                            <img
                                src={imageSrc}
                                alt={building.buildingType}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    opacity: isHovered ? 0.85 : 1,
                                    transition: 'opacity 0.3s ease'
                                }}
                                onError={() => setImageError(true)}
                            />
                            {isHovered && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    color: 'var(--bg)',
                                    backgroundColor: 'var(--primary)',
                                    padding: '10px 20px',
                                    borderRadius: '25px',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    pointerEvents: 'none',
                                    border: '1px solid var(--bg)',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                }}>
                                    🔎 View Full Size
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ padding: '0 25px 25px 25px' }}>
                        <div className="modal-section" style={{
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            padding: '20px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)'
                        }}>
                            <h4 style={{
                                borderBottom: '2px solid var(--primary)',
                                paddingBottom: '10px',
                                margin: '0 0 15px 0',
                                color: 'var(--primary)',
                                fontFamily: 'var(--header-font)'
                            }}>
                                Inhabitants & Workers
                            </h4>
                            {npcs.length > 0 ? (
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0' }}>
                                    {npcs.map(npc => (
                                        <li key={npc.id} style={{
                                            padding: '12px 0',
                                            borderBottom: '1px dashed var(--border)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>{npc.name}</span>
                                            <span style={{
                                                fontSize: '12px',
                                                color: 'var(--text-secondary)',
                                                backgroundColor: 'var(--border)',
                                                padding: '4px 12px',
                                                borderRadius: '6px',
                                                fontWeight: '500'
                                            }}>
                                                {npc.job || npc.title || 'Resident'}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p style={{
                                    fontStyle: 'italic',
                                    color: 'var(--text-secondary)',
                                    textAlign: 'center',
                                    margin: '20px 0',
                                    fontFamily: 'var(--body-font)'
                                }}>
                                    No one seems to be here right now.
                                </p>
                            )}
                        </div>

                        <button
                            className="secondary-button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                marginTop: '25px',
                                padding: '14px',
                                fontWeight: 'bold',
                                letterSpacing: '2px',
                                fontSize: '1rem'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {/* Image Lightbox Modal */}
            {isLightboxOpen && (
                <div
                    className="modal-overlay lightbox-overlay"
                    onClick={toggleLightbox}
                    style={{
                        zIndex: 2000,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out'
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={toggleLightbox}
                            style={{
                                position: 'absolute',
                                top: '-40px',
                                right: '-40px',
                                background: 'none',
                                border: 'none',
                                color: 'white',
                                fontSize: '32px',
                                cursor: 'pointer',
                                padding: '10px',
                                lineHeight: '1'
                            }}
                            aria-label="Close lightbox"
                        >
                            ✕
                        </button>
                        <img
                            src={imageSrc}
                            alt={building.buildingType}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '85vh',
                                borderRadius: '8px',
                                border: '2px solid var(--primary)',
                                boxShadow: '0 0 30px rgba(0,0,0,0.8)'
                            }}
                        />
                        <div style={{
                            marginTop: '15px',
                            color: 'white',
                            fontFamily: 'var(--header-font)',
                            fontSize: '1.2rem',
                            letterSpacing: '1px',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                        }}>
                            {building.buildingName || building.buildingType.charAt(0).toUpperCase() + building.buildingType.slice(1)}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BuildingModal;
