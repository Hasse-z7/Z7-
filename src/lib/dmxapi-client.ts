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
