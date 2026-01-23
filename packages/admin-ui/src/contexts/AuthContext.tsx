import { createContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, setToken, getToken } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check for existing session on mount
  // Since we store in memory, this will always be null on refresh
  // This is intentional - sessions don't survive page refresh (AUTH-02)
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
    }
    // If we had a token, we'd validate it here
    // For now, page refresh = re-login required
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiLogin(email, password);

      // Check if user is admin (AUTH-03)
      if (!response.user.isAdmin) {
        apiLogout(); // Clear the token we just stored
        throw new Error('Admin access required');
      }

      setUser(response.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
