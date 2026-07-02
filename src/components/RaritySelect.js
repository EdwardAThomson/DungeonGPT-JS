import React, { useEffect, useId, useRef, useState } from "react";
import { getRarityColor } from "../utils/inventorySystem";

/**
 * RaritySelect — accessible custom dropdown/listbox that renders each option's
 * label in its WoW-style rarity color.
 *
 * Native <select><option> text color is not reliably honoured by browsers
 * (especially on the closed control and across platforms), so we replace the
 * native control with a styled button + role="listbox" popup that we fully own.
 *
 * Props:
 *   value        — currently selected option id ('' for none)
 *   onChange     — (id: string) => void, called with the selected option id
 *                  (note: passes the raw id, NOT a synthetic event)
 *   options      — [{ id, name, rarity, icon }] (icon optional, rarity optional
 *                  → falls back to 'common')
 *   placeholder  — text shown when nothing is selected
 *   ariaLabel    — accessible label for the control
 *   style        — extra style merged onto the trigger button
 *   showRarityTag — when true, append "(rarity)" after the option name
 */
export default function RaritySelect({
  value,
  onChange,
  options = [],
  placeholder = "Select...",
  ariaLabel,
  style,
  showRarityTag = true,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useId();

  const selected = options.find((o) => o.id === value) || null;
  const selectedRarity = selected?.rarity || "common";

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // When opening, point the active highlight at the current selection.
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((o) => o.id === value);
      setActiveIndex(idx);
    }
  }, [open, options, value]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (idx) => {
    const opt = options[idx];
    if (opt) onChange(opt.id);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        }
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setActiveIndex((i) => Math.max(0, i - 1));
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else if (activeIndex >= 0) {
          commit(activeIndex);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const triggerStyle = {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    fontSize: "0.8rem",
    width: "100%",
    boxSizing: "border-box",
    textAlign: "left",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontFamily: "inherit",
    lineHeight: 1.3,
    ...style,
  };

  // Note: option.icon is an image PATH (e.g. "assets/icons/items/x.webp"), not an emoji,
  // so it must never be concatenated as text. This picker shows the item name + rarity tag,
  // colored by rarity (the original native select couldn't show icons either).
  const renderLabel = (opt) => {
    const tag = showRarityTag ? ` (${opt.rarity || "common"})` : "";
    return `${opt.name}${tag}`;
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={triggerStyle}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: selected ? getRarityColor(selectedRarity) : "var(--text-secondary)",
          }}
        >
          {selected ? renderLabel(selected) : placeholder}
        </span>
        <span aria-hidden="true" style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            margin: 0,
            padding: "4px",
            listStyle: "none",
            maxHeight: "260px",
            overflowY: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.4)",
          }}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.id === value;
            const isActive = idx === activeIndex;
            const color = getRarityColor(opt.rarity || "common");
            return (
              <li
                key={opt.id}
                data-index={idx}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => commit(idx)}
                style={{
                  padding: "6px 8px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "0.8rem",
                  color,
                  background: isActive ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: isSelected ? 700 : 400,
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {renderLabel(opt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
