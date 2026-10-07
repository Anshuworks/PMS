import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('pms_user');
    return raw ? JSON.parse(raw) : null;
  });

  // On every app load where a session already exists, re-fetch identity
  // from the server instead of trusting whatever was cached at login time.
  // This is what makes the app self-heal from a stale localStorage entry
  // (e.g. one saved before a field like adminRole existed) without
  // requiring the person to manually log out and back in.
  useEffect(() => {
    if (!localStorage.getItem('pms_token')) return;
    api.getMe()
      .then((fresh) => {
        setUser((prev) => {
          const merged = { ...prev, ...fresh };
          localStorage.setItem('pms_user', JSON.stringify(merged));
          return merged;
        });
      })
      .catch(() => {
        // Token invalid/expired — clear the stale session so the person
        // is prompted to log in again instead of seeing broken behavior.
        localStorage.removeItem('pms_token');
        localStorage.removeItem('pms_user');
        setUser(null);
      });
  }, []);

  function login(token, userObj, authRole, adminRole) {
    localStorage.setItem('pms_token', token);
    // authRole is the top-level 'student' | 'admin' used for route
    // protection. adminRole ('coordinator' | 'superadmin') is a separate,
    // finer-grained field — don't let it collide with userObj.role (which,
    // for an admin fetched from the DB, is already 'coordinator' or
    // 'superadmin' and would otherwise get clobbered by authRole here).
    const withRole = { ...userObj, role: authRole, adminRole: adminRole ?? userObj?.role };
    localStorage.setItem('pms_user', JSON.stringify(withRole));
    setUser(withRole);
  }

  function logout() {
    localStorage.removeItem('pms_token');
    localStorage.removeItem('pms_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
