import React, { useState } from 'react';
import { createPortal } from 'react-dom';

const ClickableImage = ({ src, alt, height = '240px', maxHeight = '240px', objectPosition = 'center 30%' }) => {
    const [isHovered, setIsHovered] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    const toggleLightbox = (e) => {
        if (e) e.stopPropagation();
        setIsLightboxOpen(!isLightboxOpen);
    };

    return (
        <>
            <div
                style={{
                    width: '100%',
                    height,
                    maxHeight,
                    marginBottom: '12px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: isHovered ? '2px solid var(--primary)' : '2px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    transform: isHovered ? 'scale(1.01)' : 'scale(1)',
                    boxShadow: isHovered ? '0 0 15px var(--primary)' : 'none',
                    position: 'relative'
                }}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={toggleLightbox}
                title="Click to view larger image"
            >
                <img
                    src={src}
                    alt={alt}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition,
                        display: 'block',
                        opacity: isHovered ? 0.85 : 1,
                        transition: 'opacity 0.3s ease'
                    }}
                />
                {isHovered && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: 'var(--bg)',
                        backgroundColor: 'var(--primary)',
                        padding: '8px 16px',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        pointerEvents: 'none',
                        border: '1px solid var(--bg)',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                    }}>
                        View Full Size
                    </div>
                )}
            </div>

            {isLightboxOpen && createPortal(
                <div
                    onClick={toggleLightbox}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 3000,
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
                            src={src}
                            alt={alt}
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
                            {alt}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default ClickableImage;
