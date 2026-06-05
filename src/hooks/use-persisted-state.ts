'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 持久化state到localStorage的hook
 * 页面切换不丢失，只在手动清除或生成成功后清除
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      const parsed = JSON.parse(stored);
      // Ensure parsed value matches the expected type
      if (typeof parsed !== typeof defaultValue) return defaultValue;
      return parsed;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [key, state]);

  const clearState = useCallback(() => {
    setState(defaultValue);
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key, defaultValue]);

  return [state, setState, clearState];
}
