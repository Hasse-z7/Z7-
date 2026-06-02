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

// ==================== AI Image Generation ====================

export async function generateImage(
  prompt: string,
  size: string = '2K',
  imageUrls?: string[],
): Promise<string[]> {
  const client = new ImageGenerationClient(config);

  const request: Record<string, unknown> = {
    prompt,
    size,
    watermark: false,
  };

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
  },
): Promise<{ videoUrl: string; lastFrameUrl?: string }> {
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const client = new VideoGenerationClient(config, { customHeaders: customHeaders as unknown as string });

  // Build content array
  const content: Array<{ type: 'text'; text: string } | { type: 'image'; imageUrl: string }> = [];

  if (options.prompt) {
    content.push({ type: 'text', text: options.prompt });
  }
  if (options.imageUrl) {
    content.push({ type: 'image', imageUrl: options.imageUrl });
  }

  // Build video generation options
  const videoOptions: Record<string, unknown> = {
    model: 'doubao-seedance-1-5-pro-251215',
    duration: options.duration || 5,
  };

  if (options.resolution) {
    videoOptions.resolution = options.resolution;
  }
  if (options.ratio && options.ratio !== 'auto') {
    videoOptions.ratio = options.ratio;
  }

  const response = await client.videoGeneration(
    content as unknown as Parameters<typeof client.videoGeneration>[0],
    videoOptions as unknown as Parameters<typeof client.videoGeneration>[1],
  );

  if (!response.videoUrl) {
    throw new Error('视频生成失败，请稍后重试');
  }

  return {
    videoUrl: response.videoUrl,
    lastFrameUrl: (response as unknown as Record<string, unknown>).lastFrameUrl as string | undefined,
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
  const client = new TTSClient(config, { customHeaders: customHeaders as unknown as string });

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
