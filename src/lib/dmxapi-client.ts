/**
 * dmxapi.cn OpenAI-compatible client for image generation.
 * Supports models like GPT Image 2, DALL-E 3, etc.
 * Base URL: https://www.dmxapi.cn/v1
 */

const DMXAPI_BASE_URL = 'https://www.dmxapi.cn/v1';

function getApiKey(): string {
  const key = process.env.DMXAPI_API_KEY || '';
  if (!key) {
    throw new Error('DMXAPI_API_KEY 环境变量未配置');
  }
  return key;
}

interface ImageGenerationResult {
  urls: string[];
  revisedPrompt?: string;
}

/**
 * Generate images using dmxapi.cn's OpenAI-compatible /v1/images/generations endpoint.
 *
 * Supported models (verified):
 * - gpt-image-2
 * - doubao-seedream-5-0-260128
 * - doubao-seedream-4-5-251128
 * - dall-e-3 (requires sufficient quota)
 */
export async function generateImageViaDmxapi(params: {
  prompt: string;
  model: string;
  size?: string;
  n?: number;
  quality?: 'standard' | 'hd';
}): Promise<ImageGenerationResult> {
  const apiKey = getApiKey();

  // Map size aliases to actual pixel sizes based on model
  let size = params.size || '1024x1024';

  // Seedream models require minimum 3686400 pixels (e.g. 2048x2048 = 4194304)
  if (params.model.includes('seedream')) {
    if (size === '1024x1024' || size === '2K') {
      size = '2048x2048';
    }
  }

  const requestBody: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: params.n || 1,
    size,
  };

  if (params.quality) {
    requestBody.quality = params.quality;
  }

  console.info(`[DmxAPI] 图片生成请求: model=${params.model}, size=${size}, prompt=${params.prompt.substring(0, 50)}`);

  const response = await fetch(`${DMXAPI_BASE_URL}/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    let errorMessage = `dmxapi.cn 请求失败 (HTTP ${response.status})`;
    try {
      const errorBody = await response.json() as { error?: { message?: string; code?: string } };
      if (errorBody.error?.message) {
        errorMessage = errorBody.error.message;
      }
      if (errorBody.error?.code === 'insufficient_user_quota') {
        errorMessage = 'dmxapi.cn 账户额度不足，请联系管理员充值';
      }
    } catch {
      // Use default error message
    }
    console.error(`[DmxAPI] 图片生成失败: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const data = await response.json() as {
    data: Array<{
      url?: string;
      b64_json?: string;
      revised_prompt?: string;
    }>;
  };

  const urls: string[] = [];
  for (const item of data.data || []) {
    if (item.url) {
      urls.push(item.url);
    } else if (item.b64_json) {
      // Convert base64 to data URL
      urls.push(`data:image/png;base64,${item.b64_json}`);
    }
  }

  if (urls.length === 0) {
    throw new Error('dmxapi.cn 返回了空结果');
  }

  const revisedPrompt = data.data?.[0]?.revised_prompt;

  return { urls, revisedPrompt };
}

/**
 * Check if a model endpoint should use dmxapi.cn instead of Coze SDK.
 * Models with platform='dmxapi' in the database should use this client.
 */
export function isDmxapiModel(platform?: string | null): boolean {
  return platform === 'dmxapi';
}

/**
 * Generate video using dmxapi.cn's /v1/responses endpoint.
 *
 * Video models on dmxapi use the OpenAI Responses API format:
 * - Submit: POST /v1/responses → returns task ID (async)
 * - Poll: POST /v1/responses/fetch → retrieve result
 *
 * Supported models:
 * - doubao-seedance-1-5-pro-responses
 * - doubao-seedance-2-0-260128
 * - doubao-seedance-2-0-fast-260128
 * - kling-v3, sora-2, viduq3-pro, wan2.6-t2v, etc.
 */
export async function generateVideoViaDmxapi(params: {
  prompt: string;
  model: string;
  duration?: number;
  resolution?: string;
  imageUrl?: string;
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<{ videoUrl: string }> {
  const apiKey = getApiKey();
  const maxAttempts = params.maxPollAttempts || 120; // 120 * 5s = 10min max
  const pollInterval = params.pollIntervalMs || 5000; // 5 seconds

  // Build input array for responses API
  const inputItems: Array<{ type: string; text?: string; image_url?: string }> = [];

  if (params.imageUrl) {
    inputItems.push({ type: 'image_url', image_url: params.imageUrl });
  }
  if (params.prompt) {
    inputItems.push({ type: 'text', text: params.prompt });
  }

  // Submit video generation task
  console.info(`[DmxAPI] 视频生成请求: model=${params.model}, duration=${params.duration || 5}s`);

  const submitBody: Record<string, unknown> = {
    model: params.model,
    input: inputItems,
    duration: params.duration || 5,
    resolution: params.resolution || '720p',
  };

  const submitResponse = await fetch(`${DMXAPI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(submitBody),
  });

  if (!submitResponse.ok) {
    let errorMessage = `dmxapi.cn 视频提交失败 (HTTP ${submitResponse.status})`;
    try {
      const errorBody = await submitResponse.json() as { error?: { message?: string; code?: string } };
      if (errorBody.error?.message) {
        errorMessage = errorBody.error.message;
      }
      if (errorBody.error?.code === 'insufficient_user_quota') {
        errorMessage = 'dmxapi.cn 账户额度不足，请联系管理员充值';
      }
    } catch {
      // Use default error message
    }
    console.error(`[DmxAPI] 视频提交失败: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const submitData = await submitResponse.json() as {
    id: string;
    output?: Array<{ type: string; content: string }>;
    status?: string;
    error?: { message?: string };
  };

  // Check if result is already available (synchronous)
  if (submitData.output && submitData.output.length > 0) {
    const videoItem = submitData.output.find((item) => item.type === 'video');
    if (videoItem?.content) {
      console.info(`[DmxAPI] 视频生成同步返回: ${submitData.id}`);
      return { videoUrl: videoItem.content };
    }
  }

  // Async: need to poll for result
  const taskId = submitData.id;
  if (!taskId) {
    throw new Error('dmxapi.cn 未返回任务ID');
  }

  console.info(`[DmxAPI] 视频任务已提交: ${taskId}, 开始轮询...`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollInterval);

    try {
      const pollResponse = await fetch(`${DMXAPI_BASE_URL}/responses/fetch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: taskId }),
      });

      if (!pollResponse.ok) {
        console.warn(`[DmxAPI] 轮询失败 HTTP ${pollResponse.status}, attempt ${attempt + 1}`);
        continue;
      }

      const pollData = await pollResponse.json() as {
        output?: Array<{ type: string; content: string }>;
        status?: string;
        error?: { message?: string };
      };

      // Check for errors
      if (pollData.error?.message) {
        throw new Error(`视频生成失败: ${pollData.error.message}`);
      }

      // Check for video output
      if (pollData.output && pollData.output.length > 0) {
        const videoItem = pollData.output.find((item) => item.type === 'video');
        if (videoItem?.content) {
          console.info(`[DmxAPI] 视频生成成功: ${taskId}, 轮询${attempt + 1}次`);
          return { videoUrl: videoItem.content };
        }
      }

      // Check status for completion
      if (pollData.status === 'completed' || pollData.status === 'succeeded') {
        // Completed but no video output - check all output items
        if (pollData.output) {
          for (const item of pollData.output) {
            if (item.content && (item.content.startsWith('http') || item.content.includes('video'))) {
              return { videoUrl: item.content };
            }
          }
        }
        throw new Error('视频任务完成但未返回视频URL');
      }

      if (pollData.status === 'failed') {
        throw new Error('视频生成失败（平台返回failed状态）');
      }

    } catch (pollError: unknown) {
      if (pollError instanceof Error && (pollError.message.includes('视频生成失败') || pollError.message.includes('完成但未返回'))) {
        throw pollError;
      }
      // Other errors: log and continue polling
      console.warn(`[DmxAPI] 轮询异常 attempt ${attempt + 1}:`, pollError instanceof Error ? pollError.message : pollError);
    }
  }

  throw new Error(`视频生成超时（已轮询${maxAttempts}次，共${(maxAttempts * pollInterval / 1000 / 60).toFixed(1)}分钟）`);
}

/**
 * Generate image via Midjourney on dmxapi.cn.
 * Uses the /mj/submit/imagine endpoint.
 */
export async function generateImageViaMj(params: {
  prompt: string;
  mode?: 'fast' | 'relax' | 'turbo';
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}): Promise<{ imageUrl: string }> {
  const apiKey = getApiKey();
  const maxAttempts = params.maxPollAttempts || 60; // 60 * 5s = 5min max
  const pollInterval = params.pollIntervalMs || 5000;

  const mode = params.mode || 'fast';
  const modelMap = {
    fast: 'mj_fast_imagine',
    relax: 'mj_relax_imagine',
    turbo: 'mj_turbo_imagine',
  };

  console.info(`[DmxAPI] MJ图片生成请求: mode=${mode}`);

  const submitResponse = await fetch(`${DMXAPI_BASE_URL.replace('/v1', '')}/mj/submit/imagine`, {
    method: 'POST',
    headers: {
      'mj-api-secret': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: params.prompt,
      model: modelMap[mode],
    }),
  });

  if (!submitResponse.ok) {
    let errorMessage = `MJ提交失败 (HTTP ${submitResponse.status})`;
    try {
      const errorBody = await submitResponse.json() as { error?: { message?: string } };
      if (errorBody.error?.message) errorMessage = errorBody.error.message;
    } catch { /* use default */ }
    throw new Error(errorMessage);
  }

  const submitData = await submitResponse.json() as {
    id?: string;
    task_id?: string;
    status?: string;
    error?: { message?: string };
  };

  const taskId = submitData.id || submitData.task_id;
  if (!taskId) {
    const errMsg = submitData.error?.message || 'MJ未返回任务ID';
    throw new Error(errMsg);
  }

  console.info(`[DmxAPI] MJ任务已提交: ${taskId}`);

  // Poll MJ task status
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await sleep(pollInterval);

    try {
      const pollResponse = await fetch(`${DMXAPI_BASE_URL.replace('/v1', '')}/mj/task/${taskId}/fetch`, {
        method: 'GET',
        headers: { 'mj-api-secret': apiKey },
      });

      if (!pollResponse.ok) continue;

      const pollData = await pollResponse.json() as {
        status?: string;
        imageUrl?: string;
        image_url?: string;
        buttons?: Array<{ customId?: string; label?: string }>;
        error?: { message?: string };
      };

      if (pollData.status === 'SUCCESS' || pollData.status === 'completed') {
        const url = pollData.imageUrl || pollData.image_url;
        if (url) {
          console.info(`[DmxAPI] MJ生成成功: ${taskId}`);
          return { imageUrl: url };
        }
        throw new Error('MJ任务完成但未返回图片URL');
      }

      if (pollData.status === 'FAILURE' || pollData.status === 'failed') {
        throw new Error(`MJ生成失败: ${pollData.error?.message || '未知原因'}`);
      }

      // Still processing (SUBMITTED, IN_PROGRESS, etc.)
    } catch (pollError: unknown) {
      if (pollError instanceof Error && (pollError.message.includes('MJ生成失败') || pollError.message.includes('完成但未返回'))) {
        throw pollError;
      }
      console.warn(`[DmxAPI] MJ轮询异常 attempt ${attempt + 1}:`, pollError instanceof Error ? pollError.message : pollError);
    }
  }

  throw new Error('MJ图片生成超时');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
