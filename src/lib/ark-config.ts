/**
 * 火山方舟配置模块
 *
 * 管理 API Key 池状态监控、熔断器。
 * 视频生成已切换到 SDK 调用，Key 池仅用于监控展示。
 *
 * 环境变量：
 *   ARK_API_KEYS=key1,key2,key3  （逗号分隔，支持多组 Key）
 */

// ==================== API Key 池管理 ====================

interface ApiKeyState {
  key: string;
  index: number;
  active: boolean;
  quotaWarning20: boolean;
  quotaWarning5: boolean;
  requestCount: number;
  failCount: number;
}

let keyPool: ApiKeyState[] = [];
let keyPoolInitialized = false;

function ensureKeyPool(): void {
  if (keyPoolInitialized) return;

  const raw = process.env.ARK_API_KEYS || '';
  const keys = raw.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) {
    console.warn('[ArkConfig] ARK_API_KEYS 未配置');
  }

  keyPool = keys.map((key, index) => ({
    key,
    index,
    active: true,
    quotaWarning20: false,
    quotaWarning5: false,
    requestCount: 0,
    failCount: 0,
  }));

  keyPoolInitialized = true;
}

/**
 * 获取所有 Key 状态（管理端监控）
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
  failures: number;
  total: number;
  openAt: number | null;
  isOpen: boolean;
}

const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  total: 0,
  openAt: null,
  isOpen: false,
};

const CB_FAILURE_THRESHOLD = 0.3;
const CB_RECOVERY_MS = 60_000;

/**
 * 检查熔断器是否打开（是否应拒绝新任务）
 */
export function isCircuitBreakerOpen(): boolean {
  if (circuitBreaker.isOpen) {
    if (circuitBreaker.openAt && Date.now() - circuitBreaker.openAt > CB_RECOVERY_MS) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      circuitBreaker.total = 0;
      circuitBreaker.openAt = null;
      console.info('[CircuitBreaker] 进入半开状态');
      return false;
    }
    return true;
  }

  return false;
}

/**
 * 记录一次调用成功
 */
export function recordCircuitSuccess(): void {
  circuitBreaker.total++;
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
      console.error(`[CircuitBreaker] 触发熔断！失败率 ${(failRate * 100).toFixed(1)}%`);
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
