import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const DebugMenu = ({ inNav = false }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const buttonStyle = inNav
        ? {
            background: 'transparent',
            border: '1px solid var(--primary)',
            color: 'var(--primary)',
            minWidth: '180px',
            minHeight: '54px',
            padding: '12px 22px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'var(--header-font)',
            fontSize: '0.85rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase'
        }
        : {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            backgroundColor: '#333',
            color: '#fff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 9999,
            boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            fontSize: '20px',
        };

    const menuStyle = inNav
        ? {
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--primary)',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 8px 18px var(--shadow)',
            zIndex: 1500,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minWidth: '250px',
        }
        : {
            position: 'fixed',
            bottom: '70px',
            right: '20px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '8px',
            padding: '10px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minWidth: '150px',
        };

    const linkStyle = inNav ? {
        textDecoration: 'none',
        color: 'var(--text)',
        fontSize: '13px',
        padding: '8px',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
    } : {
        textDecoration: 'none',
        color: '#333',
        fontSize: '14px',
        padding: '5px',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
    };

    return (
        <div style={inNav ? { position: 'relative' } : undefined}>
            {isOpen && (
                <div style={menuStyle}>
                    <div style={{ fontWeight: 'bold', borderBottom: inNav ? '1px solid var(--border)' : '1px solid #eee', paddingBottom: '5px', marginBottom: '5px', color: inNav ? 'var(--primary)' : 'inherit' }}>
                        Debug Menu
                    </div>
                    <Link to="/debug/terrain-studio-v2" style={{ ...linkStyle, color: '#4a90e2', fontWeight: 'bold' }} onClick={() => setIsOpen(false)}>
                        🧪 Terrain Studio V2
                    </Link>
                    <Link to="/debug/terrain-studio" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🧪 Terrain Studio (Old)
                    </Link>
                    <Link to="/debug/encounter-test" style={{ ...linkStyle, color: '#e74c3c', fontWeight: 'bold' }} onClick={() => setIsOpen(false)}>
                        ⚔️ Encounter Test
                    </Link>
                    <Link to="/debug/dice-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🎲 Dice Test
                    </Link>
                    <Link to="/debug/town-map-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🗺️ Map Test
                    </Link>
                    <Link to="/debug/npc-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        👤 NPC Test
                    </Link>
                    <Link to="/debug/seed-debug-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🌱 Seed Debug
                    </Link>
                    <Link to="/debug/world-map-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🌍 World Map Test
                    </Link>
                    <Link to="/debug/milestone-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🎯 Milestone Test
                    </Link>
                    <Link to="/debug/llm-debug" style={{ ...linkStyle, color: '#f44336', fontWeight: 'bold' }} onClick={() => setIsOpen(false)}>
                        🔧 LLM Pipeline Debug
                    </Link>
                    <Link to="/debug/conversation-manager" style={{ ...linkStyle, color: '#64b5f6', fontWeight: 'bold' }} onClick={() => setIsOpen(false)}>
                        🗂️ Conversation Manager
                    </Link>
                    <Link to="/debug/encounter-debug" style={linkStyle} onClick={() => setIsOpen(false)}>
                        ⚔️ Encounter Debug
                    </Link>
                </div>
            )}
            <button style={buttonStyle} onClick={toggleMenu} title="Debug Menu">
                {inNav ? '🐞 Debug' : '🐞'}
            </button>
        </div>
    );
};

export default DebugMenu;
