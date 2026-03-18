import { createContext, useContext, useState, useCallback, useMemo } from 'react';

// --- Modal Registry ---
// Each modal has a layer (z-index tier), a conflict group, and an optional parent.
const MODAL_REGISTRY = {
  map:              { layer: 0, group: 'navigation' },
  encounterInfo:    { layer: 0, group: 'navigation' },
  encounterAction:  { layer: 1, group: 'encounter' },
  settings:         { layer: 0, group: 'info' },
  howToPlay:        { layer: 0, group: 'info' },
  hero:             { layer: 0, group: 'info' },
  dice:             { layer: 0, group: 'info' },
  saveConfirmation: { layer: 0, group: 'info' },
  inventory:        { layer: 2, group: 'inventory' },
  building:         { layer: 2, group: 'child', parent: 'map' },
};

// --- Conflict Rules ---
// When opening a modal in group X, close all open modals in the listed groups.
const CONFLICT_RULES = {
  encounter:  { closes: ['navigation'] },
  navigation: { closes: ['navigation'] },
  info:       { closes: ['info'] },
};

// --- Z-Index Calculation ---
const LAYER_Z_BASE = 1000;
const LAYER_Z_STEP = 500;

export const getLayerZIndex = (layer) => LAYER_Z_BASE + (layer * LAYER_Z_STEP);

// --- Context ---
const ModalContext = createContext(null);

export const ModalProvider = ({ children }) => {
  // Stack: ordered array of { id, layer, group, data }. Topmost is last.
  const [stack, setStack] = useState([]);

  const openModal = useCallback((id, data = null) => {
    const registration = MODAL_REGISTRY[id];
    if (!registration) {
      console.warn(`[ModalManager] Unknown modal: "${id}"`);
      return;
    }

    setStack(prev => {
      let next = [...prev];

      // Remove if already open (re-opening moves to top with fresh data)
      next = next.filter(m => m.id !== id);

      // Apply conflict rules: close modals whose group is in the "closes" list
      const conflicts = CONFLICT_RULES[registration.group];
      if (conflicts?.closes) {
        next = next.filter(m => {
          const mReg = MODAL_REGISTRY[m.id];
          return !conflicts.closes.includes(mReg?.group);
        });
      }

      // Close orphaned children (parent no longer in stack)
      const openIds = new Set(next.map(m => m.id));
      next = next.filter(m => {
        const mReg = MODAL_REGISTRY[m.id];
        return !mReg.parent || openIds.has(mReg.parent);
      });

      // Push the new modal
      next.push({ id, layer: registration.layer, group: registration.group, data });
      return next;
    });
  }, []);

  const closeModal = useCallback((id) => {
    setStack(prev => {
      let next = prev.filter(m => m.id !== id);
      // Close children whose parent was the closed modal
      next = next.filter(m => {
        const mReg = MODAL_REGISTRY[m.id];
        return !mReg.parent || mReg.parent !== id;
      });
      return next;
    });
  }, []);

  const closeAll = useCallback(() => setStack([]), []);

  const isOpen = useCallback((id) => stack.some(m => m.id === id), [stack]);

  const getData = useCallback((id) => stack.find(m => m.id === id)?.data ?? null, [stack]);

  const getTopModal = useCallback(() => {
    return stack.length > 0 ? stack[stack.length - 1].id : null;
  }, [stack]);

  const isTopModal = useCallback((id) => getTopModal() === id, [getTopModal]);

  const value = useMemo(() => ({
    stack,
    openModal,
    closeModal,
    closeAll,
    isOpen,
    getData,
    getTopModal,
    isTopModal,
  }), [stack, openModal, closeModal, closeAll, isOpen, getData, getTopModal, isTopModal]);

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
};

// --- useModal Hook ---
// Convenience hook for a single modal.
export const useModal = (modalId) => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error(`useModal("${modalId}") must be used within a <ModalProvider>`);
  }

  return {
    isOpen:     ctx.isOpen(modalId),
    data:       ctx.getData(modalId),
    open:       (data) => ctx.openModal(modalId, data),
    close:      () => ctx.closeModal(modalId),
    isTopModal: ctx.isTopModal(modalId),
  };
};

// Re-export the registry for ModalShell
export { MODAL_REGISTRY };

export default ModalContext;
