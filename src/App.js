import React, { useState, useEffect } from 'react';
import './App.css';
import AdminPanel from './components/AdminPanel';
import WorkerPanel from './components/WorkerPanel';

function App() {
  const [role, setRole] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // FIX 1: Restore role from sessionStorage on load so camera/refresh doesn't log user out
  useEffect(() => {
    const savedRole = sessionStorage.getItem('role');
    if (savedRole) setRole(savedRole);
  }, []);

  const handleLogin = () => {
    if (pin === '1982') {
      sessionStorage.setItem('role', 'admin');
      setRole('admin');
      setError('');
    } else if (pin === '2026') {
      sessionStorage.setItem('role', 'worker');
      setRole('worker');
      setError('');
    } else {
      setError('Incorrect PIN. Try again.');
    }
    setPin('');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('role');
    setRole(null);
    setPin('');
    setError('');
  };

  if (!role) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>🔧 Maintenance App</h1>
          <p className="login-subtitle">Enter your PIN to continue</p>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="pin-input"
            autoFocus
          />
          {error && <p className="login-error">{error}</p>}
          <button className="login-btn" onClick={handleLogin}>Login</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {role === 'admin' ? (
        <AdminPanel onLogout={handleLogout} />
      ) : (
        <WorkerPanel onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
