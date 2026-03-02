import React from 'react';

const DatabaseIndicator = () => {
  const forceSQLite = process.env.REACT_APP_USE_SQLITE === 'true';
  const isProduction = process.env.REACT_APP_CF_PAGES === 'true';
  const usingSQLite = forceSQLite || !isProduction;

  // Only show in dev
  if (isProduction && !forceSQLite) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
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
