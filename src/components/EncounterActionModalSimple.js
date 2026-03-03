import React, { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Ultra-simple encounter modal to isolate click issues.
 * Uses React Portal to render directly on document.body,
 * completely outside Game.js DOM tree.
 */
let renderCount = 0;

const EncounterActionModalSimple = ({ isOpen, onClose, encounter, character, party, onResolve, onCharacterUpdate }) => {
  const [clickLog, setClickLog] = useState([]);
  const [phase, setPhase] = useState('actions'); // 'actions' | 'resolved'

  renderCount++;
  if (isOpen) {
    console.log(`[SIMPLE-MODAL] Render #${renderCount}`);
  }

  if (!isOpen || !encounter) return null;

  const log = (msg) => {
    console.log('[SIMPLE-MODAL]', msg);
    setClickLog(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
  };

  const handleAction = (actionLabel) => {
    log(`Action clicked: ${actionLabel}`);
    setPhase('resolved');
    
    // Simulate a basic result
    if (onResolve) {
      onResolve({
        narration: `You chose to ${actionLabel}. The encounter is resolved.`,
        outcomeTier: 'success',
        rewards: { xp: 10, gold: 5, items: [] },
        penalties: { messages: [], goldLoss: 0, itemsLost: [] },
        hpDamage: 0
      });
    }
  };

  const handleClose = () => {
    log('Close/Flee clicked');
    setPhase('actions');
    setClickLog([]);
    if (onClose) onClose();
  };

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999
      }}
      onMouseDown={(e) => {
        console.log('[SIMPLE-MODAL] mousedown on overlay');
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div style={{
        background: '#1a1a2e',
        color: '#eee',
        borderRadius: '12px',
        padding: '30px',
        maxWidth: '500px',
        width: '90%',
        maxHeight: '80vh',
        overflowY: 'auto',
        border: '2px solid #e94560'
      }}>
        <div style={{ background: '#300', color: '#f88', padding: '6px 10px', borderRadius: '4px', marginBottom: '10px', fontSize: '11px', fontFamily: 'monospace' }}>
          DEBUG: Render #{renderCount} | Portal: document.body
        </div>
        
        <h2 style={{ margin: '0 0 10px', color: '#e94560' }}>⚔️ {encounter.name}</h2>
        <p style={{ fontStyle: 'italic', marginBottom: '20px' }}>{encounter.description}</p>

        {phase === 'actions' && (
          <>
            <h3 style={{ color: '#7aa' }}>What do you do?</h3>
            
            {encounter.suggestedActions?.map((action) => (
              <button
                key={action.label}
                onMouseDown={() => {
                  console.log('[SIMPLE-MODAL] mousedown on button:', action.label);
                  handleAction(action.label);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '12px 16px',
                  margin: '8px 0',
                  background: '#16213e',
                  color: '#eee',
                  border: '2px solid #0f3460',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => { e.target.style.borderColor = '#e94560'; e.target.style.background = '#1a1a3e'; }}
                onMouseLeave={(e) => { e.target.style.borderColor = '#0f3460'; e.target.style.background = '#16213e'; }}
              >
                <strong>{action.label}</strong>
                {action.skill && <span style={{ marginLeft: '8px', opacity: 0.6 }}>({action.skill})</span>}
                <div style={{ fontSize: '13px', opacity: 0.8, marginTop: '4px' }}>{action.description}</div>
              </button>
            ))}

            <button
              onMouseDown={handleClose}
              style={{
                marginTop: '16px',
                padding: '10px 20px',
                background: '#533',
                color: '#eee',
                border: '1px solid #855',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Flee Encounter
            </button>
          </>
        )}

        {phase === 'resolved' && (
          <div>
            <p style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '18px' }}>✅ Encounter Resolved!</p>
            <p>The encounter was resolved successfully.</p>
            <button
              onMouseDown={handleClose}
              style={{
                marginTop: '16px',
                padding: '12px 24px',
                background: '#e94560',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              Continue Adventure
            </button>
          </div>
        )}

        {/* Click log for debugging */}
        {clickLog.length > 0 && (
          <div style={{ marginTop: '20px', padding: '10px', background: '#111', borderRadius: '6px', fontSize: '12px' }}>
            <strong style={{ color: '#0f3460' }}>Click Log:</strong>
            {clickLog.map((entry, i) => (
              <div key={i} style={{ color: '#8f8', fontFamily: 'monospace' }}>{entry}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Render via Portal directly on document.body - completely outside Game.js DOM tree
  return createPortal(modalContent, document.body);
};

export default EncounterActionModalSimple;
