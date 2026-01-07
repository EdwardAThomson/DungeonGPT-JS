import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const DebugMenu = () => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
    };

    const buttonStyle = {
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

    const menuStyle = {
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

    const linkStyle = {
        textDecoration: 'none',
        color: '#333',
        fontSize: '14px',
        padding: '5px',
        borderRadius: '4px',
        transition: 'background-color 0.2s',
    };

    return (
        <>
            {isOpen && (
                <div style={menuStyle}>
                    <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '5px', marginBottom: '5px' }}>
                        Debug Menu
                    </div>
                    <Link to="/dice-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🎲 Dice Test
                    </Link>
                    <Link to="/town-map-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🗺️ Map Test
                    </Link>
                    <Link to="/npc-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        👤 NPC Test
                    </Link>
                    <Link to="/seed-debug-test" style={linkStyle} onClick={() => setIsOpen(false)}>
                        🌱 Seed Debug
                    </Link>
                </div>
            )}
            <button style={buttonStyle} onClick={toggleMenu} title="Debug Menu">
                🐞
            </button>
        </>
    );
};

export default DebugMenu;
