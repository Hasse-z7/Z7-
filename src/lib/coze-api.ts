/**
 * Coze API integration layer for AI creation features
 * Uses coze-coding-dev-sdk for image, video, audio generation
 */

import {
  ImageGenerationClient,
  buildImageGenerationApiRequest,
  VideoGenerationClient,
  TTSClient,
  buildTTSApiRequest,
} from 'coze-coding-dev-sdk';
import type {
  ImageGenerationRequest,
  Content,
  TTSRequest,
} from 'coze-coding-dev-sdk';

export const CozeAPI = {
  /**
   * AI Image Generation - text-to-image
   */
  async generateImage(params: {
    prompt: string;
    size?: string;
    model?: string;
  }): Promise<{ image_urls: string[]; task_id: string }> {
    const client = new ImageGenerationClient();
    const request: ImageGenerationRequest = {
      prompt: params.prompt,
      size: params.size || '2K',
      model: params.model,
    };
    const apiRequest = buildImageGenerationApiRequest(request, request.model || 'doubao-seedream-5-0-260128');
    const res = await client.generate(apiRequest);
    const helper = client.getResponseHelper(res);
    return {
      image_urls: helper.imageUrls,
      task_id: `img_${res.created}`,
    };
  },

  /**
   * AI Video Generation - text/image to video
   */
  async generateVideo(params: {
    prompt: string;
    imageUrl?: string;
    duration?: number;
    resolution?: '480p' | '720p' | '1080p';
    ratio?: '16:9' | '9:16' | '1:1';
  }): Promise<{ video_url: string; task_id: string }> {
    const client = new VideoGenerationClient();
    const contentItems: Content[] = [];
    if (params.imageUrl) {
      contentItems.push({
        type: 'image_url',
        image_url: { url: params.imageUrl },
      });
    }
    contentItems.push({
      type: 'text',
      text: params.prompt,
    });
    const res = await client.videoGeneration(contentItems, {
      duration: params.duration || 5,
      resolution: params.resolution || '720p',
      ratio: params.ratio || '16:9',
    });
    return {
      video_url: res.videoUrl || '',
      task_id: res.response?.id || `vid_${Date.now()}`,
    };
  },

  /**
   * AI Music Generation (placeholder - uses LLM + TTS)
   */
  async generateMusic(params: {
    prompt: string;
    style?: string;
  }): Promise<{ audio_url: string; task_id: string; lyrics?: string }> {
    return {
      audio_url: '',
      task_id: `mus_${Date.now()}`,
      lyrics: `Generated lyrics for: ${params.prompt}`,
    };
  },

  /**
   * Text-to-Speech for Digital Human
   */
  async generateTTS(params: {
    text: string;
    uid: string;
    speaker?: string;
  }): Promise<{ audio_url: string }> {
    const client = new TTSClient();
    const request: TTSRequest = {
      uid: params.uid,
      text: params.text,
      speaker: params.speaker || 'zh_female_xiaohe_uranus_bigtts',
      audioFormat: 'mp3',
      sampleRate: 24000,
    };
    const apiRequest = buildTTSApiRequest(request);
    const res = await client.synthesize(apiRequest);
    return {
      audio_url: res.audioUri,
    };
  },

  /**
   * Digital Human Video Generation (placeholder)
   */
  async generateDigitalHuman(params: {
    prompt: string;
    audioUrl: string;
    avatarStyle?: string;
    orientation?: string;
  }): Promise<{ video_url: string; task_id: string }> {
    return {
      video_url: '',
      task_id: `dh_${Date.now()}`,
    };
  },
};
