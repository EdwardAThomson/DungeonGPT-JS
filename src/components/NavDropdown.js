import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import '../styles/navigation.css';

const NavDropdown = ({ label, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleButtonKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      // Focus first menu item after state updates
      setTimeout(() => {
        const firstLink = menuRef.current?.querySelector('a');
        firstLink?.focus();
      }, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      // Focus last menu item
      setTimeout(() => {
        const links = menuRef.current?.querySelectorAll('a');
        links?.[links.length - 1]?.focus();
      }, 0);
    }
  };

  const handleMenuKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const links = Array.from(menuRef.current?.querySelectorAll('a') || []);
      const currentIndex = links.indexOf(document.activeElement);
      const nextIndex = (currentIndex + 1) % links.length;
      links[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const links = Array.from(menuRef.current?.querySelectorAll('a') || []);
      const currentIndex = links.indexOf(document.activeElement);
      const prevIndex = currentIndex <= 0 ? links.length - 1 : currentIndex - 1;
      links[prevIndex]?.focus();
    }
  };

  return (
    <li className="nav-dropdown" ref={dropdownRef}>
      <button
        ref={buttonRef}
        className="nav-dropdown-toggle"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleButtonKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`${label} menu`}
      >
        {label} <span className="dropdown-arrow" aria-hidden="true">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <ul 
          ref={menuRef}
          className="nav-dropdown-menu"
          role="menu"
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item, index) => (
            <li key={index} role="none">
              <Link 
                to={item.path} 
                onClick={() => setIsOpen(false)}
                role="menuitem"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

export default NavDropdown;
