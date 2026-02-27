import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/user-profile.css';

const UserProfileIndicator = () => {
  const { user, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  // Get initials from email
  const getInitials = (email) => {
    if (!email) return '?';
    return email.charAt(0).toUpperCase();
  };

  if (!user) {
    return (
      <div className="user-profile-indicator">
        <Link to="/login" className="login-link">Sign In</Link>
      </div>
    );
  }

  return (
    <div className="user-profile-indicator" ref={dropdownRef}>
      <button 
        className="profile-avatar-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={user.email}
      >
        <span className="avatar-initials">{getInitials(user.email)}</span>
      </button>

      {isOpen && (
        <div className="profile-dropdown">
          <div className="profile-dropdown-header">
            <span className="profile-email">{user.email}</span>
          </div>
          <div className="profile-dropdown-divider" />
          <Link 
            to="/profile" 
            className="profile-dropdown-item"
            onClick={() => setIsOpen(false)}
          >
            👤 Profile
          </Link>
          <button 
            className="profile-dropdown-item profile-signout"
            onClick={handleSignOut}
          >
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileIndicator;
