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
  vip_expires_at: string | null;
  is_admin: boolean;
  created_at: string;
  daily_image_count: number;
  daily_video_count: number;
  daily_music_count: number;
  daily_digital_count: number;
}

interface AuthContextType {
  user: { id: string; email: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/profile', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setProfile(data.profile);
        } else {
          setUser(null);
          setProfile(null);
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
    setUser(data.user);
    setProfile(data.profile);
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/login', { method: 'DELETE', credentials: 'include' });
    } catch {
      // Ignore
    }
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(() => ({
    user, profile, loading, refreshProfile, login, register, logout,
  }), [user, profile, loading, refreshProfile, login, register, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
