// RdDialog: the small confirm/alert dialog for the redesigned in-app pages (#82). One
// shape for every short pop-up (validation alerts, delete confirms, "hero added"), so
// they match the redesign instead of the old .modal-content box. Clicking the backdrop
// or pressing Escape calls onClose. Styles: .rd-dialog in src/styles/redesign.css.

import React, { useEffect } from 'react';
import '../styles/redesign.css';

const RdDialog = ({ title, children, actions, onClose, tone = 'default', wide = false }) => {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rd-dialog-overlay" data-theme="redesign" onClick={onClose}>
      <div
        className={`rd-dialog${tone !== 'default' ? ` ${tone}` : ''}${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="rd-dialog-title">{title}</h2>}
        <div className="rd-dialog-body">{children}</div>
        {actions && <div className="rd-dialog-actions">{actions}</div>}
      </div>
    </div>
  );
};

export default RdDialog;
