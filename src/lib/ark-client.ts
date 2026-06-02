/**
 * 火山方舟 API 客户端
 *
 * 负责与火山方舟 Seedance 视频生成模型交互：
 *   - 提交异步视频生成任务
 *   - 查询任务状态
 *   - 内置指数退避重试、Key 自动切换、熔断防护
 *
 * 方舟 API 文档参考：
 *   提交任务: POST {ARK_BASE_URL}/contents/generations/tasks
 *   查询任务: GET  {ARK_BASE_URL}/contents/generations/tasks/{task_id}
 */

import {
  ARK_BASE_URL,
  ARK_MODEL_ENDPOINT,
  getNextApiKey,
  markKeyFailed,
  markKeySuccess,
  isCircuitBreakerOpen,
  recordCircuitSuccess,
  recordCircuitFailure,
} from './ark-config';

// ==================== 类型定义 ====================

export interface VideoTaskRequest {
  prompt: string;
  negativePrompt?: string;
  model?: string;            // 模型Endpoint ID（前端传入，不写死）
  ratio?: string;            // 16:9, 9:16, 1:1, 4:3, 3:4, 21:9
  duration?: number;        // 5 或 10
  fps?: number;            // 24
  referenceImages?: string[]; // 参考图URL数组
  audioUrl?: string;       // MP3音频URL
  audioEnabled?: boolean;
}

export interface ArkSubmitResponse {
  id: string;              // 方舟任务ID
  model: string;
  status: string;
  created_at: number;
}

export interface ArkTaskResult {
  id: string;
  model: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  output?: {
    content: Array<{
      type: string;
      video_url?: { url: string };
      image_url?: { url: string };
    }>;
  };
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/** 可重试的 HTTP 状态码 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** 不可重试的错误码（参数错误、密钥失效等） */
const NON_RETRYABLE_CODES = new Set([
  'invalid_api_key',
  'invalid_request_error',
  'insufficient_quota',
  'model_not_found',
  'invalid_endpoint',
]);

/** 最大重试次数 */
const MAX_RETRIES = 3;

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;

/** 单次任务最大等待时间（15分钟） */
const MAX_POLL_DURATION_MS = 15 * 60 * 1000;

// ==================== 核心函数 ====================

/**
 * 提交视频生成任务到方舟
 *
 * 内置重试逻辑：
 *   - 5xx / 429: 指数退避重试，最多3次
 *   - 400 / 参数错误 / 密钥失效: 直接失败不重试
 *   - 单 Key 失败自动切换下一个 Key
 */
export async function submitVideoTask(
  params: VideoTaskRequest,
): Promise<{ taskId: string; apiKeyIndex: number }> {
  // 检查熔断器
  if (isCircuitBreakerOpen()) {
    throw new Error('系统繁忙，请稍后再试（熔断保护中）');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const keyInfo = getNextApiKey();
    if (!keyInfo) {
      throw new Error('无可用 API Key，请联系管理员');
    }

    try {
      const requestBody = buildRequestBody(params);
      const response = await fetch(`${ARK_BASE_URL}/contents/generations/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${keyInfo.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000), // 30s超时
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const statusCode = response.status;

        // 判断是否可重试
        if (RETRYABLE_STATUS_CODES.has(statusCode)) {
          // 5xx / 429: 指数退避重试
          markKeyFailed(keyInfo.index);
          lastError = new Error(`方舟API返回 ${statusCode}: ${errorBody}`);

          if (attempt < MAX_RETRIES - 1) {
            const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
            console.warn(`[ArkClient] 提交失败(尝试 ${attempt + 1}/${MAX_RETRIES}), ${delay.toFixed(0)}ms 后重试: ${statusCode}`);
            await sleep(delay);
            continue;
          }
          recordCircuitFailure();
          throw lastError;
        }

        // 4xx 非429: 不可重试的错误
        markKeyFailed(keyInfo.index);
        recordCircuitFailure();

        // 检查是否密钥相关错误
        if (statusCode === 401 || statusCode === 403) {
          throw new Error('API Key 无效或已过期，请联系管理员');
        }

        throw new Error(`方舟API返回 ${statusCode}: ${errorBody}`);
      }

      const data: ArkSubmitResponse = await response.json();
      markKeySuccess(keyInfo.index);
      recordCircuitSuccess();

      console.info(`[ArkClient] 视频任务已提交: 方舟任务ID=${data.id}, Key #${keyInfo.index}`);
      return { taskId: data.id, apiKeyIndex: keyInfo.index };

    } catch (error: unknown) {
      if (error instanceof Error && Array.from(NON_RETRYABLE_CODES).some((code: string) =>
        error.message.includes(code)
      )) {
        // 不可重试的错误，直接抛出
        recordCircuitFailure();
        throw error;
      }

      // 网络错误等，可重试
      markKeyFailed(keyInfo.index);
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[ArkClient] 提交异常(尝试 ${attempt + 1}/${MAX_RETRIES}), ${delay.toFixed(0)}ms 后重试: ${lastError.message}`);
        await sleep(delay);
        continue;
      }

      recordCircuitFailure();
      throw lastError;
    }
  }

  throw lastError || new Error('提交视频任务失败');
}

/**
 * 查询方舟任务状态
 *
 * @returns 任务结果，status 可能是 pending/running/succeeded/failed
 */
export async function queryArkTask(
  arkTaskId: string,
  apiKeyIndex: number,
): Promise<ArkTaskResult> {
  const keyInfo = getApiKeyByIndex(apiKeyIndex);
  if (!keyInfo) {
    throw new Error(`API Key #${apiKeyIndex} 不存在`);
  }

  const response = await fetch(
    `${ARK_BASE_URL}/contents/generations/tasks/${arkTaskId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${keyInfo}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`查询方舟任务失败: ${response.status} ${errorBody}`);
  }

  return await response.json();
}

/**
 * 轮询方舟任务直到完成
 *
 * @param arkTaskId 方舟任务ID
 * @param apiKeyIndex 使用的API Key序号
 * @param onStatusChange 状态变更回调
 * @returns 最终任务结果
 */
export async function pollArkTask(
  arkTaskId: string,
  apiKeyIndex: number,
  onStatusChange?: (status: string) => void,
): Promise<ArkTaskResult> {
  const startTime = Date.now();

  while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
    try {
      const result = await queryArkTask(arkTaskId, apiKeyIndex);

      // 通知状态变更
      if (onStatusChange) {
        onStatusChange(result.status);
      }

      if (result.status === 'succeeded') {
        return result;
      }

      if (result.status === 'failed') {
        const errMsg = result.error?.message || '方舟视频生成失败';
        throw new Error(errMsg);
      }

      // pending / running: 继续轮询
      await sleep(POLL_INTERVAL_MS);

    } catch (error: unknown) {
      // 查询失败可能是暂时性的，重试几次
      if (error instanceof Error && error.message.includes('方舟视频生成失败')) {
        throw error; // 方舟明确说失败了
      }

      // 网络错误等，等一会再查
      console.warn(`[ArkClient] 查询任务异常，${POLL_INTERVAL_MS}ms 后重试: ${error instanceof Error ? error.message : error}`);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  // 超时
  throw new Error('视频生成超时（15分钟），请稍后在作品列表查看');
}

// ==================== 请求体构建 ====================

/**
 * 构建方舟视频生成请求体
 */
function buildRequestBody(params: VideoTaskRequest): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];

  // 文本提示词
  if (params.prompt) {
    content.push({
      type: 'text',
      text: params.prompt,
    });
  }

  // 参考图片
  if (params.referenceImages && params.referenceImages.length > 0) {
    for (const imgUrl of params.referenceImages) {
      content.push({
        type: 'image_url',
        image_url: { url: imgUrl },
      });
    }
  }

  // MP3 音频
  if (params.audioEnabled && params.audioUrl) {
    content.push({
      type: 'audio_url',
      audio_url: { url: params.audioUrl },
    });
  }

  const body: Record<string, unknown> = {
    model: params.model || ARK_MODEL_ENDPOINT,
    content,
  };

  // 视频参数（方舟支持的字段）
  if (params.ratio) {
    body.ratio = params.ratio;
  }
  if (params.duration) {
    body.duration = params.duration;
  }
  if (params.fps) {
    body.fps = params.fps;
  }
  if (params.negativePrompt) {
    body.negative_prompt = params.negativePrompt;
  }

  return body;
}

// ==================== 辅助函数 ====================

/**
 * 根据 index 获取 API Key
 */
function getApiKeyByIndex(index: number): string | null {
  const raw = process.env.ARK_API_KEYS || '';
  const keys = raw.split(',').map(k => k.trim()).filter(k => k.length > 0);
  return keys[index] || null;
}

/**
 * 休眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
