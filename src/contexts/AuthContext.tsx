import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { User } from '@/types/api';
import { apiClient } from '@/lib/api';
import { syncStart, syncStop } from '@/lib/sync';

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * The sync engine is a single application-wide resource, so only one window may
 * drive its lifecycle. Ticket popups mount this provider too, and having each
 * of them call sync_start on mount would restart syncing repeatedly.
 */
function isMainWindow(): boolean {
  try {
    return getCurrentWindow().label === 'main';
  } catch {
    // Outside Tauri (tests, plain browser): behave like the main window.
    return true;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const startSyncFor = useCallback(async (session: User) => {
    if (!isMainWindow()) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
      await syncStart(token, session);
    } catch (error) {
      console.error('Failed to start sync:', error);
    }
  }, []);

  useEffect(() => {
    // Restore the session, then hand the sync engine its credentials so the
    // first pull starts before the UI has finished rendering.
    const savedUser = localStorage.getItem('user');
    if (savedUser && apiClient.isAuthenticated()) {
      try {
        const parsed = JSON.parse(savedUser) as User;
        setUser(parsed);
        void startSyncFor(parsed);
      } catch (error) {
        console.error('Stored session was unreadable; signing out:', error);
        localStorage.removeItem('user');
        apiClient.logout();
      }
    }
    setIsLoading(false);
  }, [startSyncFor]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true);
      const response = await apiClient.login(email, password);

      if (response.status === 'success') {
        setUser(response.user);
        localStorage.setItem('user', JSON.stringify(response.user));
        await startSyncFor(response.user);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    apiClient.logout();
    setUser(null);
    localStorage.removeItem('user');

    // Clears the local store as well, so the next person to sign in on this
    // machine cannot see the previous user's tickets.
    if (isMainWindow()) {
      void syncStop().catch((error) => {
        console.error('Failed to stop sync:', error);
      });
    }
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    isLoading,
    isAuthenticated: !!user && apiClient.isAuthenticated(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
