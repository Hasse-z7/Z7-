import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, Message, HeaderUtils } from 'coze-coding-dev-sdk';
import { generateImage } from '@/lib/coze-api';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';
import { checkUserCategoryRateLimit, getCategoryRateLimitMessage } from '@/lib/rate-limiter';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  // IP限流：视频去水印5次/分钟
  const rateLimited = rateLimitResponse(request, 'eraser');
  if (rateLimited) return rateLimited;

  try {
    const { user } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 智能体侧用户分类限流：修图去水印≤5次/分钟
    const userCategoryCheck = checkUserCategoryRateLimit(user.id, 'eraser');
    if (!userCategoryCheck.allowed) {
      return NextResponse.json(
        { error: getCategoryRateLimitMessage('eraser') },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { frame_urls, prompt: customPrompt } = body as {
      frame_urls?: string[];
      prompt?: string;
    };

    if (!frame_urls || frame_urls.length === 0) {
      return NextResponse.json({ error: '请提供视频帧图片' }, { status: 400 });
    }

    const results: { frame_index: number; result_url: string }[] = [];
    const framesToProcess = frame_urls.slice(0, 8);

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();

    for (let i = 0; i < framesToProcess.length; i++) {
      const frameUrl = framesToProcess[i];

      try {
        // Step 1: LLM analyze the frame
        const client = new LLMClient(config, customHeaders);
        const messages: Message[] = [
          {
            role: 'system',
            content: '你是画面修复工程师。分析图片中需要去除的水印、字幕、logo等元素，生成修复提示词。只输出提示词。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: customPrompt || '请去除图片中的水印、字幕、logo等标记，自然修复画面，保持原始内容和风格',
              },
              { type: 'image_url', image_url: { url: frameUrl } },
            ],
          },
        ];

        const stream = client.stream(messages, {
          model: 'doubao-seed-2-0-pro-260215',
          temperature: 0.5,
        });

        let repairPrompt = '';
        for await (const chunk of stream) {
          if (chunk.content) {
            repairPrompt += chunk.content.toString();
          }
        }

        // Step 2: Image-to-image repair
        const enhancedPrompt = `${repairPrompt}。保持原图整体构图、色调、风格不变，自然填充被擦除的区域，无痕修复。`;
        const resultUrls = await generateImage(enhancedPrompt, '2K', [frameUrl]);

        if (resultUrls && resultUrls.length > 0) {
          results.push({ frame_index: i, result_url: resultUrls[0] });
        }
      } catch (frameError) {
        console.error(`Frame ${i} eraser error:`, frameError);
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: '所有帧处理失败，请重试' }, { status: 500 });
    }

    // Save to user works
    const { supabase } = await getAuthUser(request);
    await supabase.from('user_works').insert({
      user_id: user.id,
      work_type: 'image',
      file_url: results[0].result_url,
      prompt: `视频帧擦除修复: ${customPrompt || '去除标注区域'}`,
      credits_cost: 2 * results.length,
    });

    return NextResponse.json({
      success: true,
      results,
      total_frames: framesToProcess.length,
      processed_frames: results.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '视频帧擦除失败';
    console.error('Video eraser error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
