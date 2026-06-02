/**
 * 火山方舟配置模块
 *
 * 管理 API Key 池、负载均衡、熔断器、额度监控。
 *
 * 环境变量：
 *   ARK_API_KEYS=key1,key2,key3  （逗号分隔，支持多组 Key 负载均衡）
 *   ARK_MODEL_ENDPOINT=ark-45c3d43e-bbd4-48ef-b995-4f156a2c1967-31b72
 *   ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
 */

// ==================== 固定配置 ====================

/** 方舟模型接入点ID（固定） */
export const ARK_MODEL_ENDPOINT = 'ark-45c3d43e-bbd4-48ef-b995-4f156a2c1967-31b72';

/** 方舟请求域名（固定） */
export const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

// ==================== API Key 池管理 ====================

interface ApiKeyState {
  key: string;
  index: number;
  active: boolean;          // 是否在线（额度耗尽时下线）
  quotaWarning20: boolean;  // 额度低于20%预警
  quotaWarning5: boolean;   // 额度低于5%预警
  requestCount: number;     // 已分配任务数（用于负载均衡）
  failCount: number;        // 近期失败次数
  lastFailAt: number;       // 上次失败时间戳
  lastQuotaCheckAt: number; // 上次额度检查时间
}

let keyPool: ApiKeyState[] = [];
let keyPoolInitialized = false;

/**
 * 初始化 API Key 池
 */
function ensureKeyPool(): void {
  if (keyPoolInitialized) return;

  const raw = process.env.ARK_API_KEYS || '';
  const keys = raw.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) {
    console.warn('[ArkConfig] ARK_API_KEYS 未配置，视频生成功能不可用');
  }

  keyPool = keys.map((key, index) => ({
    key,
    index,
    active: true,
    quotaWarning20: false,
    quotaWarning5: false,
    requestCount: 0,
    failCount: 0,
    lastFailAt: 0,
    lastQuotaCheckAt: 0,
  }));

  keyPoolInitialized = true;
}

/**
 * 获取最优 API Key（最少请求 + 在线状态）
 *
 * 负载均衡策略：选择当前在线且已分配任务数最少的 Key
 */
export function getNextApiKey(): { key: string; index: number } | null {
  ensureKeyPool();

  const activeKeys = keyPool.filter(k => k.active);
  if (activeKeys.length === 0) {
    console.error('[ArkConfig] 所有 API Key 已下线，无可用 Key');
    return null;
  }

  // 优先选择分配任务最少的 Key
  activeKeys.sort((a, b) => a.requestCount - b.requestCount);
  const selected = activeKeys[0];
  selected.requestCount++;

  return { key: selected.key, index: selected.index };
}

/**
 * 标记 Key 调用失败
 */
export function markKeyFailed(index: number): void {
  ensureKeyPool();
  const ks = keyPool.find(k => k.index === index);
  if (ks) {
    ks.failCount++;
    ks.lastFailAt = Date.now();
  }
}

/**
 * 重置 Key 失败计数（成功时调用）
 */
export function markKeySuccess(index: number): void {
  ensureKeyPool();
  const ks = keyPool.find(k => k.index === index);
  if (ks) {
    ks.failCount = 0;
  }
}

/**
 * 下线 Key（额度耗尽）
 */
export function deactivateKey(index: number): void {
  ensureKeyPool();
  const ks = keyPool.find(k => k.index === index);
  if (ks) {
    ks.active = false;
    console.warn(`[ArkConfig] API Key #${index} 已下线（额度耗尽）`);
  }
}

/**
 * 设置 Key 额度预警
 */
export function setKeyQuotaWarning(index: number, level: 'warning20' | 'warning5' | 'exhausted'): void {
  ensureKeyPool();
  const ks = keyPool.find(k => k.index === index);
  if (!ks) return;

  if (level === 'warning20') {
    ks.quotaWarning20 = true;
    console.warn(`[ArkConfig] API Key #${index} 额度低于 20%`);
  } else if (level === 'warning5') {
    ks.quotaWarning5 = true;
    console.warn(`[ArkConfig] API Key #${index} 额度低于 5%！`);
  } else {
    ks.active = false;
    console.error(`[ArkConfig] API Key #${index} 额度耗尽，已下线`);
  }
}

/**
 * 获取所有 Key 状态（管理端查看）
 */
export function getKeyPoolStatus(): Array<{
  index: number;
  active: boolean;
  requestCount: number;
  failCount: number;
  quotaWarning20: boolean;
  quotaWarning5: boolean;
}> {
  ensureKeyPool();
  return keyPool.map(k => ({
    index: k.index,
    active: k.active,
    requestCount: k.requestCount,
    failCount: k.failCount,
    quotaWarning20: k.quotaWarning20,
    quotaWarning5: k.quotaWarning5,
  }));
}

// ==================== 熔断器 ====================

interface CircuitBreakerState {
  failures: number;       // 最近1分钟内的失败次数
  total: number;          // 最近1分钟内的总调用次数
  openAt: number | null;  // 熔断打开时间
  isOpen: boolean;        // 当前是否熔断
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  total: 0,
  openAt: null,
  isOpen: false,
};

/** 熔断阈值：1分钟内失败率超30%触发熔断 */
const CB_FAILURE_THRESHOLD = 0.3;
/** 熔断窗口：60秒 */
const CB_WINDOW_MS = 60_000;
/** 熔断恢复时间：60秒后半开 */
const CB_RECOVERY_MS = 60_000;

/**
 * 检查熔断器是否打开（是否应拒绝新任务）
 */
export function isCircuitBreakerOpen(): boolean {
  // 如果已熔断，检查是否到恢复时间
  if (circuitBreaker.isOpen) {
    if (circuitBreaker.openAt && Date.now() - circuitBreaker.openAt > CB_RECOVERY_MS) {
      // 半开状态：允许一个请求通过测试
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      circuitBreaker.total = 0;
      circuitBreaker.openAt = null;
      console.info('[CircuitBreaker] 进入半开状态，允许试运行');
      return false;
    }
    return true;
  }

  // 清理超过窗口的记录（简化：每次检查时如果超过窗口就重置）
  // 注意：这是一个简化实现，生产环境应使用滑动窗口
  return false;
}

/**
 * 记录一次调用成功
 */
export function recordCircuitSuccess(): void {
  circuitBreaker.total++;
  // 成功时重置计数
  if (circuitBreaker.isOpen) {
    circuitBreaker.isOpen = false;
    circuitBreaker.openAt = null;
    console.info('[CircuitBreaker] 恢复正常');
  }
}

/**
 * 记录一次调用失败
 */
export function recordCircuitFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.total++;

  if (circuitBreaker.total >= 3) {
    const failRate = circuitBreaker.failures / circuitBreaker.total;
    if (failRate > CB_FAILURE_THRESHOLD) {
      circuitBreaker.isOpen = true;
      circuitBreaker.openAt = Date.now();
      console.error(`[CircuitBreaker] 触发熔断！失败率 ${(failRate * 100).toFixed(1)}%，暂停接收新任务 ${CB_RECOVERY_MS / 1000}s`);
    }
  }
}

/**
 * 获取熔断器状态
 */
export function getCircuitBreakerStatus(): {
  isOpen: boolean;
  failures: number;
  total: number;
  failRate: string;
} {
  const failRate = circuitBreaker.total > 0
    ? ((circuitBreaker.failures / circuitBreaker.total) * 100).toFixed(1) + '%'
    : '0%';
  return {
    isOpen: circuitBreaker.isOpen,
    failures: circuitBreaker.failures,
    total: circuitBreaker.total,
    failRate,
  };
}

/**
 * 重置熔断器（管理端操作）
 */
export function resetCircuitBreaker(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.total = 0;
  circuitBreaker.openAt = null;
  circuitBreaker.isOpen = false;
  console.info('[CircuitBreaker] 已手动重置');
}
