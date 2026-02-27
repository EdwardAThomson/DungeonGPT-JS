import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Profile = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await signOut();
    navigate('/');
  };

  if (!user) {
    return (
      <div className="page-container">
        <h1>Profile</h1>
        <p>You need to be logged in to view this page.</p>
      </div>
    );
  }

  return (
    <div className="page-container">
      <h1>Profile</h1>
      
      <div className="profile-card">
        <div className="profile-avatar-large">
          {user.email?.charAt(0).toUpperCase() || '?'}
        </div>
        
        <div className="profile-info">
          <h2>Account Details</h2>
          
          <div className="profile-field">
            <label>Email</label>
            <p>{user.email}</p>
          </div>
          
          <div className="profile-field">
            <label>Account Created</label>
            <p>{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
          
          <div className="profile-field">
            <label>Last Sign In</label>
            <p>{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : 'Unknown'}</p>
          </div>
        </div>
      </div>

      <div className="profile-actions">
        <button 
          onClick={handleSignOut}
          className="signout-btn"
          disabled={isSigningOut}
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      <style>{`
        .profile-card {
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 30px;
          max-width: 500px;
          margin: 20px 0;
        }

        .profile-avatar-large {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background-color: var(--primary);
          color: var(--bg);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-header);
          font-size: 2rem;
          font-weight: bold;
          margin-bottom: 20px;
        }

        .profile-info h2 {
          margin-top: 0;
          margin-bottom: 20px;
          font-size: 1.2rem;
        }

        .profile-field {
          margin-bottom: 15px;
        }

        .profile-field label {
          display: block;
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .profile-field p {
          margin: 0;
          font-family: var(--font-ui);
          color: var(--text);
        }

        .profile-actions {
          margin-top: 30px;
        }

        .signout-btn {
          background-color: transparent;
          color: var(--state-danger);
          border-color: var(--state-danger);
        }

        .signout-btn:hover:not(:disabled) {
          background-color: var(--state-danger);
          color: white;
        }
      `}</style>
    </div>
  );
};

export default Profile;
