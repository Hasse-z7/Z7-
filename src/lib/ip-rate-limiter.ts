/**
 * 后端IP限流中间件
 * 
 * 限流规则：
 * - 注册/登录/找回密码：5次/分钟/IP
 * - 图片生成：10次/分钟/IP
 * - 视频生成：3次/分钟/IP
 * - 提示词反推/视频反解：5次/分钟/IP
 * - 去水印/去字幕：5次/分钟/IP
 * - 充值算力：3次/分钟/IP
 * - 全局兜底：60次/分钟/IP
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// 内存存储，进程重启后清空
const store = new Map<string, RateLimitEntry>();

// 定期清理过期条目（每5分钟）
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetTime) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export type RateLimitTier =
  | 'auth'        // 注册/登录/找回密码
  | 'image'       // 图片生成
  | 'video'       // 视频生成
  | 'analyze'     // 提示词反推/视频反解
  | 'eraser'      // 去水印/去字幕
  | 'recharge'    // 充值算力
  | 'global';     // 全局兜底

const TIER_LIMITS: Record<RateLimitTier, number> = {
  auth: 5,
  image: 10,
  video: 3,
  analyze: 5,
  eraser: 5,
  recharge: 3,
  global: 60,
};

const WINDOW_MS = 60 * 1000; // 1分钟窗口

/**
 * 获取客户端IP
 */
function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  return 'unknown';
}

/**
 * 检查IP是否超过限流
 * @returns { allowed: boolean, remaining: number, resetIn: number }
 */
export function checkIPRateLimit(
  request: Request,
  tier: RateLimitTier,
): { allowed: boolean; remaining: number; resetIn: number } {
  const ip = getClientIP(request);
  const key = `${tier}:${ip}`;
  const now = Date.now();
  const limit = TIER_LIMITS[tier];

  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    // 新窗口
    store.set(key, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetIn: WINDOW_MS };
  }

  if (entry.count >= limit) {
    const resetIn = entry.resetTime - now;
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetTime - now };
}

/**
 * 限流检查 + 429响应（便捷函数）
 * 如果超限，返回429 NextResponse；否则返回null
 */
export function rateLimitResponse(
  request: Request,
  tier: RateLimitTier,
): Response | null {
  const result = checkIPRateLimit(request, tier);
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: '请求频繁，请稍后重试',
        retryAfter: Math.ceil(result.resetIn / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(result.resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }
  return null;
}
