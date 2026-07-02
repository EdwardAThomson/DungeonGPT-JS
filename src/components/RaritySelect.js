import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { getRarityColor, RARITY_RANK } from "../utils/inventorySystem";

// Names render in a uniform neutral grey; the rarity tag carries the rarity color.
const NAME_COLOR = "#c9c9c9";

/**
 * RaritySelect — accessible custom dropdown/listbox for item options where the rarity is
 * color-coded. Native <select><option> text color isn't reliably honoured by browsers, so
 * we own the popup. Each option shows its name in grey with a rarity-colored "(rarity)" tag.
 *
 * Props:
 *   value        — selected option id ('' for none)
 *   onChange     — (id) => void (raw id, not an event)
 *   options      — [{ id, name, rarity }] (rarity optional → 'common')
 *   placeholder  — text when nothing selected
 *   ariaLabel    — accessible label
 *   style        — extra style merged onto the trigger button
 *   showRarityTag — append "(rarity)" after the name (default true)
 *   sortByRarity — order options by rarity (then name), low → high (default false)
 */
export default function RaritySelect({
  value,
  onChange,
  options: rawOptions = [],
  placeholder = "Select...",
  ariaLabel,
  style,
  showRarityTag = true,
  sortByRarity = false,
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listboxId = useId();

  // Optionally group options by rarity (then name) so the list reads low → high rarity.
  const options = useMemo(() => {
    if (!sortByRarity) return rawOptions;
    return [...rawOptions].sort((a, b) => {
      const ra = RARITY_RANK[a?.rarity ?? "common"] ?? 0;
      const rb = RARITY_RANK[b?.rarity ?? "common"] ?? 0;
      return ra - rb || String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  }, [rawOptions, sortByRarity]);

  const selected = options.find((o) => o.id === value) || null;

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // When opening, point the active highlight at the current selection.
  useEffect(() => {
    if (open) setActiveIndex(options.findIndex((o) => o.id === value));
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
        if (!open) setOpen(true);
        else setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) setOpen(true);
        else setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) setOpen(true);
        else if (activeIndex >= 0) commit(activeIndex);
        break;
      case "Escape":
        if (open) { e.preventDefault(); setOpen(false); }
        break;
      case "Home":
        if (open) { e.preventDefault(); setActiveIndex(0); }
        break;
      case "End":
        if (open) { e.preventDefault(); setActiveIndex(options.length - 1); }
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

  // Name in neutral grey; rarity tag in its rarity color. option.icon is a file PATH, not
  // an emoji, so it is never concatenated as text.
  const renderLabel = (opt) => (
    <>
      <span style={{ color: NAME_COLOR }}>{opt.name}</span>
      {showRarityTag && (
        <span style={{ color: getRarityColor(opt.rarity || "common") }}>
          {" "}({opt.rarity || "common"})
        </span>
      )}
    </>
  );

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
            color: selected ? NAME_COLOR : "var(--text-secondary)",
          }}
        >
          {selected ? renderLabel(selected) : placeholder}
        </span>
        <span aria-hidden="true" style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>▾</span>
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
                  background: isActive ? "rgba(255, 255, 255, 0.08)" : "transparent",
                  fontWeight: isSelected ? 700 : 400,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {renderLabel(opt)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
