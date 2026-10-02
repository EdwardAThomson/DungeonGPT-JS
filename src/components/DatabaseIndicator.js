import React from 'react';

const DatabaseIndicator = () => {
  const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
  const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
  const usingSQLite = forceSQLite || !isProduction;

  // Only show in dev
  if (isProduction && !forceSQLite) return null;

  return (
    // Sits above the fixed bottom docks (new game, party) and ignores pointer events,
    // so this dev-only badge never covers or blocks their buttons.
    <div style={{
      position: 'fixed',
      bottom: '84px',
      right: '10px',
      pointerEvents: 'none',
      padding: '6px 12px',
      backgroundColor: usingSQLite ? 'var(--state-warning)' : 'var(--state-success)',
      color: 'var(--bg)',
      borderRadius: '4px',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      zIndex: 9999,
      boxShadow: '0 2px 8px var(--shadow)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}>
      <span style={{ fontSize: '1rem' }}>{usingSQLite ? '💾' : '☁️'}</span>
      {usingSQLite ? 'SQLite (Local)' : 'Supabase (Cloud)'}
    </div>
  );
};

export default DatabaseIndicator;
