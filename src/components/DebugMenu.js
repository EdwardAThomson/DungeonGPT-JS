import React from 'react';
import { useNavigate } from 'react-router-dom';

const DebugMenu = ({ inNav = false }) => {
    const navigate = useNavigate();

    const buttonStyle = inNav
        ? {}
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

    return (
        <button
            style={buttonStyle}
            className={inNav ? 'nav-settings-btn' : ''}
            onClick={() => navigate('/debug')}
            title="Debug Menu"
        >
            {inNav ? '🐞 Debug' : '🐞'}
        </button>
    );
};

export default DebugMenu;
