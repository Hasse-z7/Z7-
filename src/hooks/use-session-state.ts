'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * 持久化state到sessionStorage的hook
 * 同一浏览器Tab内页面切换不丢失，关闭Tab后清除
 * 适用于AI生成任务记录等场景
 */
export function useSessionState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [key, state]);

  const clearState = useCallback(() => {
    setState(defaultValue);
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }, [key, defaultValue]);

  return [state, setState, clearState];
}
