'use client';

import { useRef, useCallback, useState } from 'react';

interface ThrottleOptions {
  /** 同功能点击冷却时间(ms)，默认3000 */
  cooldown?: number;
  /** 请求进行中是否锁定按钮，默认true */
  lockWhilePending?: boolean;
}

interface ActionState {
  /** 是否正在请求中 */
  loading: boolean;
  /** 是否处于冷却期 */
  cooling: boolean;
  /** 冷却剩余秒数（向下取整） */
  cooldownRemaining: number;
}

/**
 * 按钮3秒冷却 + 请求中锁定的限流Hook
 *
 * @example
 * const { run, loading, cooling, cooldownRemaining } = useActionThrottle(async () => {
 *   await fetch('/api/ai/image', { ... });
 * });
 *
 * <Button disabled={loading || cooling} onClick={run}>
 *   {loading ? '生成中...' : cooling ? `${cooldownRemaining}秒后可再次点击` : 'AI生图'}
 * </Button>
 */
export function useActionThrottle<T extends (...args: unknown[]) => Promise<unknown>>(
  action: T,
  options: ThrottleOptions = {},
) {
  const { cooldown = 3000, lockWhilePending = true } = options;

  const lastCallRef = useRef<number>(0);
  const pendingRef = useRef<boolean>(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [state, setState] = useState<ActionState>({
    loading: false,
    cooling: false,
    cooldownRemaining: 0,
  });

  const clearCooldownTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startCooldown = useCallback(() => {
    const startTime = Date.now();
    const endTime = startTime + cooldown;

    setState((s) => ({ ...s, cooling: true, cooldownRemaining: Math.ceil(cooldown / 1000) }));

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
      if (remaining <= 0) {
        clearCooldownTimer();
        setState((s) => ({ ...s, cooling: false, cooldownRemaining: 0 }));
      } else {
        setState((s) => ({ ...s, cooldownRemaining: remaining }));
      }
    }, 500);
  }, [cooldown, clearCooldownTimer]);

  const run = useCallback(
    async (...args: Parameters<T>) => {
      const now = Date.now();

      // 请求中锁定
      if (lockWhilePending && pendingRef.current) return;
      // 冷却期拒绝
      if (now - lastCallRef.current < cooldown) return;

      lastCallRef.current = now;
      pendingRef.current = true;
      setState({ loading: true, cooling: false, cooldownRemaining: 0 });
      startCooldown();

      try {
        return await action(...args);
      } finally {
        pendingRef.current = false;
        setState((s) => ({ ...s, loading: false }));
      }
    },
    [action, cooldown, lockWhilePending, startCooldown],
  );

  return {
    /** 触发动作（自动限流） */
    run,
    /** 是否请求中 */
    loading: state.loading,
    /** 是否冷却中 */
    cooling: state.cooling,
    /** 冷却剩余秒数 */
    cooldownRemaining: state.cooldownRemaining,
    /** 按钮是否应禁用 */
    disabled: state.loading || state.cooling,
  };
}
