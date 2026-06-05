/**
 * AI 请求并发控制和速率限制
 *
 * 目标：支持100人同时使用AI功能（5 DMXAPI Key + 动态Key扩展）
 * 容量规划：
 *   - Coze平台(1 Key): ~5 QPS → ~300 RPM
 *   - DMXAPI(5+ Keys): ~25+ QPS → ~1500+ RPM
 *   - 合计吞吐: ~30+ QPS → ~1800+ RPM
 *   - 100人场景：人均1次/30s → ~200 RPM峰值，当前Key配置可覆盖
 *
 * 扩容路径：
 *   - 50人: 5 DMXAPI Key 足够
 *   - 100人: 需8-10 DMXAPI Key + 5-6 ARK Key（仅改环境变量，代码自动轮转）
 *
 * 策略：
 *   1. 并发槽位控制 - 限制同时在处理的AI请求数
 *   2. 速率限制 - 每分钟请求数上限
 *   3. 排队机制 - 超出并发限制的请求进入队列
 *   4. 多KEY轮转 - dmxapi.cn支持多KEY提高吞吐（自动轮转负载均衡）
 *   5. 优先级 - VIP用户优先处理
 *   6. 熔断保护 - 方舟API失败率超30%暂停接收，60秒后半开
 *   7. 自适应Key检测 - 自动感知Key池大小，动态调整并发上限
 */

// ==================== 并发槽位控制 ====================

interface ConcurrencySlot {
  id: string;
  userId: string;
  model: string;
  startTime: number;
}

const activeSlots: ConcurrencySlot[] = [];

/**
 * 动态计算最大并发数：基于Key池大小自适应
 * 每个DMXAPI Key贡献 ~10 并发 + Coze平台 10 并发 + 基础缓冲 10
 */
function getEffectiveMaxConcurrent(): number {
  ensureDmxapiKeyPool();
  const keyCount = dmxapiKeyPool.filter(k => k.active).length;
  return Math.max(30, keyCount * 10 + 10 + 10); // 5 Key→70, 8 Key→100, 10 Key→120
}

/** @deprecated 使用 getEffectiveMaxConcurrent() 替代 */
const MAX_CONCURRENT = 100; // 静态上限兜底（动态计算优先）
const SLOT_TIMEOUT_MS = 3 * 60 * 1000; // 3分钟超时自动释放（图片/音乐通常10-30s，视频异步不入槽）

// ==================== 速率限制 ====================

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分钟窗口

/**
 * 动态计算全局速率限制：基于Key池大小自适应
 * 每个DMXAPI Key贡献 ~60 RPM + Coze平台 ~20 RPM
 */
function getEffectiveRateLimit(): number {
  ensureDmxapiKeyPool();
  const keyCount = dmxapiKeyPool.filter(k => k.active).length;
  return Math.max(300, keyCount * 60 + 20 + 100); // 5 Key→420, 8 Key→600, 10 Key→720
}

/** @deprecated 使用 getEffectiveRateLimit() 替代 */
const RATE_LIMIT_MAX_REQUESTS = 600; // 静态上限兜底

// ==================== 排队系统 ====================

interface QueueItem {
  id: string;
  userId: string;
  model: string;
  priority: number; // 0=普通, 1=VIP
  resolve: (slotId: string) => void;
  reject: (reason: string | Error) => void;
  enqueuedAt: number;
}

const requestQueue: QueueItem[] = [];
const QUEUE_TIMEOUT_MS = 120 * 1000; // 排队120秒超时（100人场景排队可能稍长）

// ==================== 多KEY轮转（dmxapi.cn）====================

interface DmxapiKeyState {
  key: string;
  index: number;
  active: boolean;
  requestCount: number;
  failCount: number;
  lastUsedAt: number;
}

let dmxapiKeyPool: DmxapiKeyState[] = [];
let dmxapiKeyPoolInitialized = false;
let dmxapiKeyIndex = 0;

function ensureDmxapiKeyPool(): void {
  if (dmxapiKeyPoolInitialized) return;

  const raw = process.env.DMXAPI_API_KEYS || process.env.DMXAPI_API_KEY || '';
  const keys = raw.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);

  dmxapiKeyPool = keys.map((key: string, index: number) => ({
    key,
    index,
    active: true,
    requestCount: 0,
    failCount: 0,
    lastUsedAt: 0,
  }));

  if (dmxapiKeyPool.length === 0) {
    console.warn('[RateLimiter] DMXAPI_API_KEYS 未配置');
  }

  dmxapiKeyPoolInitialized = true;
}

/**
 * 获取下一个可用的dmxapi KEY（轮转+跳过失败KEY）
 */
export function getNextDmxapiKey(): string {
  ensureDmxapiKeyPool();

  if (dmxapiKeyPool.length === 0) {
    throw new Error('DMXAPI_API_KEYS 未配置');
  }

  // 如果只有一个KEY直接返回
  if (dmxapiKeyPool.length === 1) {
    dmxapiKeyPool[0].requestCount++;
    dmxapiKeyPool[0].lastUsedAt = Date.now();
    return dmxapiKeyPool[0].key;
  }

  // 轮转选择，跳过不活跃的KEY
  for (let i = 0; i < dmxapiKeyPool.length; i++) {
    const idx = (dmxapiKeyIndex + i) % dmxapiKeyPool.length;
    const keyState = dmxapiKeyPool[idx];

    if (keyState.active) {
      dmxapiKeyIndex = (idx + 1) % dmxapiKeyPool.length;
      keyState.requestCount++;
      keyState.lastUsedAt = Date.now();
      return keyState.key;
    }
  }

  // 所有KEY都不活跃，重置并使用第一个
  dmxapiKeyPool.forEach((k) => { k.active = true; k.failCount = 0; });
  dmxapiKeyPool[0].requestCount++;
  dmxapiKeyPool[0].lastUsedAt = Date.now();
  return dmxapiKeyPool[0].key;
}

/**
 * 标记dmxapi KEY调用失败
 */
export function markDmxapiKeyFailed(key: string): void {
  ensureDmxapiKeyPool();
  const keyState = dmxapiKeyPool.find((k) => k.key === key);
  if (keyState) {
    keyState.failCount++;
    if (keyState.failCount >= 5) {
      keyState.active = false;
      console.warn(`[RateLimiter] dmxapi KEY #${keyState.index} 已禁用（连续失败${keyState.failCount}次）`);
    }
  }
}

/**
 * 标记dmxapi KEY调用成功
 */
export function markDmxapiKeySuccess(key: string): void {
  ensureDmxapiKeyPool();
  const keyState = dmxapiKeyPool.find((k) => k.key === key);
  if (keyState) {
    keyState.failCount = 0;
    keyState.active = true;
  }
}

/**
 * 获取dmxapi KEY池状态
 */
export function getDmxapiKeyPoolStatus(): Array<{
  index: number;
  active: boolean;
  requestCount: number;
  failCount: number;
}> {
  ensureDmxapiKeyPool();
  return dmxapiKeyPool.map((k) => ({
    index: k.index,
    active: k.active,
    requestCount: k.requestCount,
    failCount: k.failCount,
  }));
}

// ==================== 并发槽位管理 ====================

/**
 * 清理超时的槽位
 */
function cleanupTimedOutSlots(): void {
  const now = Date.now();
  const timedOut = activeSlots.filter(
    (slot) => now - slot.startTime > SLOT_TIMEOUT_MS
  );

  for (const slot of timedOut) {
    console.warn(`[RateLimiter] 槽位超时释放: ${slot.id}, model=${slot.model}, userId=${slot.userId}`);
    const idx = activeSlots.indexOf(slot);
    if (idx >= 0) activeSlots.splice(idx, 1);
  }
}

/**
 * 获取当前可用槽位数
 */
export function getAvailableSlots(): number {
  cleanupTimedOutSlots();
  return Math.max(0, getEffectiveMaxConcurrent() - activeSlots.length);
}

/**
 * 占用一个并发槽位
 */
function acquireSlot(userId: string, model: string): string {
  const slotId = `slot_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  activeSlots.push({
    id: slotId,
    userId,
    model,
    startTime: Date.now(),
  });
  return slotId;
}

/**
 * 释放一个并发槽位
 */
export function releaseSlot(slotId: string): void {
  const idx = activeSlots.findIndex((slot) => slot.id === slotId);
  if (idx >= 0) {
    const slot = activeSlots[idx];
    activeSlots.splice(idx, 1);
    console.info(`[RateLimiter] 槽位释放: ${slotId}, model=${slot.model}, 剩余=${activeSlots.length}/${getEffectiveMaxConcurrent()}`);
  }

  // 检查队列中是否有等待的请求
  processQueue();
}

// ==================== 速率限制 ====================

/**
 * 检查全局速率限制
 */
function checkRateLimit(): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get('global') || { timestamps: [] };

  // 清理过期时间戳
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= getEffectiveRateLimit()) {
    return false; // 超出速率限制
  }

  entry.timestamps.push(now);
  rateLimitMap.set('global', entry);
  return true;
}

/**
 * 检查用户级速率限制
 */
export function checkUserRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const USER_RATE_LIMIT = 15; // 每个用户每分钟15次AI请求（防止单用户占满并发）
  const entry = rateLimitMap.get(`user_${userId}`) || { timestamps: [] };

  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  const allowed = entry.timestamps.length < USER_RATE_LIMIT;
  if (allowed) {
    entry.timestamps.push(now);
    rateLimitMap.set(`user_${userId}`, entry);
  }

  return { allowed, remaining: Math.max(0, USER_RATE_LIMIT - entry.timestamps.length) };
}

// ==================== 排队系统 ====================

/**
 * 处理队列中的等待请求
 */
function processQueue(): void {
  while (activeSlots.length < getEffectiveMaxConcurrent() && requestQueue.length > 0) {
    // 按优先级排序（VIP优先），同优先级按时间排序
    requestQueue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.enqueuedAt - b.enqueuedAt;
    });

    const item = requestQueue.shift();
    if (!item) break;

    const slotId = acquireSlot(item.userId, item.model);
    item.resolve(slotId);
  }

  // 超时清理
  const now = Date.now();
  const timedOut = requestQueue.filter((item) => now - item.enqueuedAt > QUEUE_TIMEOUT_MS);
  for (const item of timedOut) {
    const idx = requestQueue.indexOf(item);
    if (idx >= 0) {
      requestQueue.splice(idx, 1);
      item.reject(new Error('排队超时，请稍后重试'));
    }
  }
}

/**
 * 请求AI并发许可（带排队）
 *
 * @returns slotId - 用于释放槽位
 * @throws 排队超时或速率限制
 */
export async function acquireAISlot(params: {
  userId: string;
  model: string;
  isVip?: boolean;
}): Promise<string> {
  // 1. 检查用户速率限制
  const userLimit = checkUserRateLimit(params.userId);
  if (!userLimit.allowed) {
    throw new Error('操作过于频繁，请稍后再试');
  }

  // 2. 检查全局速率限制
  if (!checkRateLimit()) {
    throw new Error('系统繁忙，请稍后再试');
  }

  // 3. 尝试直接获取槽位
  cleanupTimedOutSlots();
  if (activeSlots.length < getEffectiveMaxConcurrent()) {
    const slotId = acquireSlot(params.userId, params.model);
    console.info(`[RateLimiter] 直接获取槽位: ${slotId}, model=${params.model}, 活跃=${activeSlots.length}/${getEffectiveMaxConcurrent()}`);
    return slotId;
  }

  // 4. 没有空闲槽位，进入队列
  return new Promise<string>((resolve, reject) => {
    const queueItem: QueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      userId: params.userId,
      model: params.model,
      priority: params.isVip ? 1 : 0,
      resolve,
      reject,
      enqueuedAt: Date.now(),
    };

    requestQueue.push(queueItem);
    const queuePosition = requestQueue.length;
    console.info(`[RateLimiter] 进入排队: userId=${params.userId}, model=${params.model}, 队列位置=${queuePosition}`);
  });
}

// ==================== 状态监控 ====================

/**
 * 获取当前系统负载状态
 */
export function getLoadStatus(): {
  activeSlots: number;
  maxConcurrent: number;
  queueLength: number;
  dmxapiKeys: number;
  dmxapiActiveKeys: number;
  effectiveRateLimit: number;
} {
  ensureDmxapiKeyPool();
  cleanupTimedOutSlots();

  return {
    activeSlots: activeSlots.length,
    maxConcurrent: getEffectiveMaxConcurrent(),
    queueLength: requestQueue.length,
    dmxapiKeys: dmxapiKeyPool.length,
    dmxapiActiveKeys: dmxapiKeyPool.filter((k) => k.active).length,
    effectiveRateLimit: getEffectiveRateLimit(),
  };
}

/**
 * 获取当前活跃任务详情
 */
export function getActiveTasks(): Array<{
  id: string;
  userId: string;
  model: string;
  duration: number;
}> {
  const now = Date.now();
  return activeSlots.map((slot) => ({
    id: slot.id,
    userId: slot.userId,
    model: slot.model,
    duration: Math.round((now - slot.startTime) / 1000),
  }));
}
