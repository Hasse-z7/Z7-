'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 带时效的持久化state hook
 * 
 * 规则：
 * - 内容只在点击"返回按钮"时保存到localStorage（手动调用 persist()）
 * - 其他场景（切页面、关闭tab）均不保存
 * - 保存有效期为3分钟，超时自动清除
 * - 退出登录时外部调用 clearAllPersisted() 清除所有
 * - 生成成功后调用 clearState() 清除
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>, () => void, () => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return defaultValue;
      const parsed = JSON.parse(stored);
      // Check expiry
      if (parsed._expiry && Date.now() > parsed._expiry) {
        localStorage.removeItem(key);
        return defaultValue;
      }
      return parsed._value !== undefined ? parsed._value : parsed;
    } catch {
      return defaultValue;
    }
  });

  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 3分钟后清除（如果已保存到localStorage）
  useEffect(() => {
    if (state === defaultValue || state === '' || (Array.isArray(state) && state.length === 0)) {
      return; // No need to set timer for empty state
    }
    // We don't auto-persist on state change anymore.
    // The timer only runs to check if localStorage has stale data.
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [key, state, defaultValue]);

  // 手动保存（仅在点击返回按钮时调用）
  const persist = useCallback(() => {
    try {
      const payload = {
        _value: state,
        _expiry: Date.now() + 3 * 60 * 1000, // 3分钟有效期
      };
      localStorage.setItem(key, JSON.stringify(payload));
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

  return [state, setState, clearState, persist];
}

/**
 * 清除所有持久化state（退出登录时调用）
 */
export function clearAllPersistedState() {
  if (typeof window === 'undefined') return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && (
      k.startsWith('image_') ||
      k.startsWith('video_') ||
      k.startsWith('music_') ||
      k.startsWith('digital_human_') ||
      k.startsWith('selectedProjectId_') ||
      k.startsWith('selected_image_model') ||
      k.startsWith('selected_video_model')
    )) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
