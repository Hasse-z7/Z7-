import {
  ImageGenerationClient,
  VideoGenerationClient,
  TTSClient,
  LLMClient,
  Config,
  HeaderUtils,
} from 'coze-coding-dev-sdk';
import type { NextRequest } from 'next/server';

// Shared config - API credentials auto-loaded from env vars
const config = new Config();

// Video SDK types (mirrored from coze-coding-dev-sdk/dist/types/video/models)
type VideoResolution = '480p' | '720p' | '1080p';
type VideoRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4' | '21:9' | 'adaptive';
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
  const client = new ImageGenerationClient(config);

  const request: Record<string, unknown> = {
    prompt,
    size,
    watermark: false,
  };

  // 使用前端传来的模型Endpoint，覆盖默认值
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
  request: NextRequest,
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
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = new VideoGenerationClient(config, customHeaders as Record<string, string>);

  // Build content array - must match SDK Content type exactly
  const content: VideoContent[] = [];

  if (options.prompt) {
    content.push({ type: 'text', text: options.prompt });
  }
  if (options.imageUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: options.imageUrl },
    });
  }

  // Build video generation options matching SDK signature exactly
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
  const client = new LLMClient(config);

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

  // LLMResponse - extract text content
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
