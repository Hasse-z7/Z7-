'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

interface UserProfile {
  id: string;
  user_id: string;
  nickname: string;
  avatar_url: string;
  phone: string;
  credits: number;
  vip_level: string;
  vip_expire_at: string | null;
  is_admin: boolean;
  created_at: string;
  daily_image_count: number;
  daily_video_count: number;
  daily_music_count: number;
  daily_digital_count: number;
}

interface AuthContextType {
  user: { id: string; email: string; phone?: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  token: string | null;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithPhone: (phone: string, code: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  updateCredits: (credits: number) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  token: null,
  refreshProfile: async () => {},
  login: async () => {},
  loginWithPhone: async () => {},
  register: async () => {},
  logout: async () => {},
  updateCredits: () => {},
});

const TOKEN_KEY = 'sb-access-token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string; phone?: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-session'] = storedToken;
      }

      const res = await fetch('/api/auth/profile', {
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setProfile(data.profile);
          setToken(storedToken);
        } else {
          setUser(null);
          setProfile(null);
          setToken(null);
          localStorage.removeItem(TOKEN_KEY);
        }
      }
    } catch {
      // Not authenticated
    }
  }, []);

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '登录失败');

    if (data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
    }

    setUser(data.user);
    setProfile(data.profile);
  }, []);

  const loginWithPhone = useCallback(async (phone: string, code: string) => {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '验证码登录失败');

    if (data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
    }

    setUser(data.user);
    setProfile(data.profile);
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, nickname }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');

    if (data.access_token) {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
    }

    setUser(data.user);
    setProfile(data.profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const headers: Record<string, string> = {};
      if (storedToken) {
        headers['x-session'] = storedToken;
      }
      await fetch('/api/auth/login', {
        method: 'DELETE',
        credentials: 'include',
        headers,
      });
    } catch {
      // Ignore
    }
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setProfile(null);
    setToken(null);
  }, []);

  const updateCredits = useCallback((credits: number) => {
    setProfile(prev => prev ? { ...prev, credits } : prev);
  }, []);

  const value = useMemo(() => ({
    user, profile, loading, token, refreshProfile, login, loginWithPhone, register, logout, updateCredits,
  }), [user, profile, loading, token, refreshProfile, login, loginWithPhone, register, logout, updateCredits]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Helper to get auth headers for API calls from localStorage
 * Use this in components that need to make authenticated fetch calls
 */
export function getAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) {
    return { 'x-session': t };
  }
  return {};
}
