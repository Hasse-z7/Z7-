import {
  ImageGenerationClient,
  VideoGenerationClient,
  TTSClient,
  LLMClient,
  Config,
  HeaderUtils,
} from 'coze-coding-dev-sdk';
import type { NextRequest } from 'next/server';

/**
 * Config factory for IMAGE generation.
 * Uses user's COZE_API_KEY (sk-xxx) with api.coze.cn if available.
 * Falls back to platform defaults.
 */
function getImageConfig(): Config {
  const userApiKey = process.env.COZE_API_KEY;
  if (userApiKey) {
    return new Config({
      apiKey: userApiKey,
      baseUrl: 'https://api.coze.cn',
      modelBaseUrl: 'https://api.coze.cn/api/v3',
    });
  }
  return new Config();
}

/**
 * Config factory for VIDEO generation.
 * ALWAYS uses platform's COZE_WORKLOAD_IDENTITY_API_KEY + integration.coze.cn,
 * because user's sk-xxx key does not have video generation permissions.
 */
function getVideoConfig(): Config {
  return new Config();
}

/**
 * Config factory for TTS/LLM.
 * Uses user's COZE_API_KEY with api.coze.cn if available.
 * Falls back to platform defaults.
 */
function getTTSConfig(): Config {
  const userApiKey = process.env.COZE_API_KEY;
  if (userApiKey) {
    return new Config({
      apiKey: userApiKey,
      baseUrl: 'https://api.coze.cn',
      modelBaseUrl: 'https://api.coze.cn/api/v3',
    });
  }
  return new Config();
}

// Video SDK types (mirrored from coze-coding-dev-sdk/dist/types/video/models)
interface VideoImageURL { url: string }
interface VideoImageURLContent { type: 'image_url'; image_url: VideoImageURL; role?: 'first_frame' | 'last_frame' | 'reference_image' }
interface VideoTextContent { type: 'text'; text: string }
type VideoContent = VideoTextContent | VideoImageURLContent;

// ==================== AI Image Generation ====================

export async function generateImage(
  prompt: string,
  size: string = '2K',
  imageUrls?: string[],
  modelEndpoint?: string,
): Promise<string[]> {
  const client = new ImageGenerationClient(getImageConfig());

  const request: Record<string, unknown> = {
    prompt,
    size,
    watermark: false,
  };

  if (modelEndpoint) {
    request.model = modelEndpoint;
  }

  if (imageUrls && imageUrls.length > 0) {
    request.image = imageUrls.length === 1 ? imageUrls[0] : imageUrls;
  }

  const response = await client.generate(request as unknown as Parameters<typeof client.generate>[0]);
  const helper = client.getResponseHelper(response);

  if (!helper.success || !helper.imageUrls || helper.imageUrls.length === 0) {
    throw new Error('图片生成失败，请稍后重试');
  }

  return helper.imageUrls;
}

// ==================== AI Video Generation ====================

export async function generateVideo(
  requestOrOptions: NextRequest | null,
  options: {
    prompt?: string;
    imageUrl?: string;
    duration?: number;
    resolution?: string;
    ratio?: string;
    generateAudio?: boolean;
    modelEndpoint?: string;
  },
): Promise<{ videoUrl: string; lastFrameUrl?: string }> {
  const config = getVideoConfig();
  let customHeaders: Record<string, string> = {};

  // Only extract forward headers from a real NextRequest
  if (requestOrOptions && requestOrOptions instanceof Request) {
    try {
      const extracted = HeaderUtils.extractForwardHeaders(requestOrOptions.headers);
      if (extracted && typeof extracted === 'object') {
        customHeaders = extracted as Record<string, string>;
      }
    } catch {
      // Ignore header extraction errors
    }
  }

  const client = new VideoGenerationClient(config, customHeaders);

  // Build content array
  const content: VideoContent[] = [];

  if (options.prompt) {
    content.push({ type: 'text', text: options.prompt });
  }
  if (options.imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: options.imageUrl },
      role: 'first_frame',
    });
  }

  // Build video generation options
  const videoOptions: Record<string, unknown> = {
    model: options.modelEndpoint || 'doubao-seedance-1-5-pro-251215',
    duration: options.duration || 5,
    watermark: false,
    generateAudio: options.generateAudio ?? true,
  };

  if (options.resolution && ['480p', '720p', '1080p'].includes(options.resolution)) {
    videoOptions.resolution = options.resolution;
  }
  if (options.ratio && options.ratio !== 'auto') {
    const validRatios = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
    if (validRatios.includes(options.ratio)) {
      videoOptions.ratio = options.ratio;
    }
  }

  console.info(`[CozeAPI] 视频生成请求: model=${videoOptions.model}, duration=${videoOptions.duration}, hasImage=${!!options.imageUrl}, hasPrompt=${!!options.prompt}, baseUrl=${config.baseUrl}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await client.videoGeneration(content as any, videoOptions as any);

  if (!response.videoUrl) {
    const errMsg = (response.response as unknown as Record<string, unknown>)?.error_message as string || '视频生成失败，请稍后重试';
    throw new Error(errMsg);
  }

  return {
    videoUrl: response.videoUrl,
    lastFrameUrl: response.lastFrameUrl || undefined,
  };
}

// ==================== AI Music Generation ====================

export async function generateMusic(prompt: string, style?: string): Promise<string> {
  const client = new LLMClient(getTTSConfig());

  const systemPrompt = `你是一位专业的音乐创作AI。根据用户描述生成音乐创作方案，包含曲风、节奏、乐器编配等。${
    style ? `用户指定曲风：${style}。` : ''
  }请直接输出音乐创作描述。`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: prompt },
  ];

  const llmConfig = {
    model: 'doubao-seed-2-0-pro-260215',
  };

  const response = await client.invoke(messages, llmConfig);

  const text = typeof response === 'string'
    ? response
    : (response as unknown as Record<string, unknown>).content as string || JSON.stringify(response);

  return text;
}

// ==================== TTS (Text-to-Speech) ====================

export async function generateTTS(
  request: NextRequest,
  text: string,
  voiceType?: string,
): Promise<string> {
  const config = getTTSConfig();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = new TTSClient(config, customHeaders as Record<string, string>);

  const ttsRequest: Record<string, unknown> = {
    uid: `tts_${Date.now()}`,
    text,
  };

  if (voiceType) {
    ttsRequest.voice_type = voiceType;
  }

  const response = await client.synthesize(ttsRequest as unknown as Parameters<typeof client.synthesize>[0]);

  const respObj = response as unknown as Record<string, unknown>;
  if (!respObj.audioUri) {
    throw new Error('语音合成失败，请稍后重试');
  }

  return respObj.audioUri as string;
}
