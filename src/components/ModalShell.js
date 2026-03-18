import React from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import { useModal, MODAL_REGISTRY, getLayerZIndex } from '../contexts/ModalContext';

/**
 * Standardised modal wrapper.
 * Handles: overlay, z-index, FocusTrap (active only when topmost), Escape key, portal.
 *
 * Usage:
 *   <ModalShell modalId="map" className="map-modal-content" ariaLabel="World Map">
 *     <h2>World Map</h2>
 *     ...
 *   </ModalShell>
 */
const ModalShell = ({
  modalId,
  children,
  className = '',
  style,
  ariaLabel,
  usePortal = false,
  onClose,           // optional extra cleanup beyond closing the modal
}) => {
  const { isOpen, close, isTopModal } = useModal(modalId);
  const registration = MODAL_REGISTRY[modalId];

  if (!isOpen || !registration) return null;

  const zIndex = getLayerZIndex(registration.layer);

  const handleClose = () => {
    if (onClose) onClose();
    close();
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isTopModal) {
      handleClose();
    }
  };

  const content = (
    <div className="modal-overlay" onClick={handleOverlayClick} style={{ zIndex }}>
      <FocusTrap active={isTopModal} focusTrapOptions={{ allowOutsideClick: true }}>
        <div
          className={`modal-content ${className}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleKeyDown}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={style}
        >
          {children}
        </div>
      </FocusTrap>
    </div>
  );

  if (usePortal) {
    return createPortal(content, document.body);
  }
  return content;
};

export default ModalShell;
