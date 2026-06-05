import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, Message, HeaderUtils } from 'coze-coding-dev-sdk';
import { generateImage } from '@/lib/coze-api';
import { rateLimitResponse } from '@/lib/ip-rate-limiter';
import { checkUserCategoryRateLimit, getCategoryRateLimitMessage } from '@/lib/rate-limiter';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  // IP限流：去水印5次/分钟
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
    const { image_url, mask_data_url, prompt: customPrompt } = body as {
      image_url?: string;
      mask_data_url?: string;
      prompt?: string;
    };

    if (!image_url) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    // Step 1: Use LLM vision to analyze the image and generate a repair prompt
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const analysisPrompt = `你是一个专业的画面修复工程师。用户上传了一张图片${mask_data_url ? '，并标注了需要擦除/修复的区域（红色标记部分）' : ''}。
请分析图片内容，生成一个精准的画面修复提示词，要求：
1. 描述原图的整体内容和风格
2. 明确指出需要去除的水印、字幕、logo等元素
3. 描述擦除后应该如何自然填充该区域
4. 保持原图的整体风格和色调不变

只输出修复提示词，不要其他内容。`;

    const messages: Message[] = [
      { role: 'system', content: analysisPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: customPrompt || '请去除图片中标注区域的内容，自然修复画面' },
          { type: 'image_url', image_url: { url: image_url } },
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

    // Step 2: Use image-to-image to repair the image
    const enhancedPrompt = `${repairPrompt}。保持原图整体构图、色调、风格不变，自然填充被擦除的区域，无痕修复。`;

    const resultUrls = await generateImage(
      enhancedPrompt,
      '2K',
      [image_url],
      undefined,
      undefined,
    );

    if (!resultUrls || resultUrls.length === 0) {
      return NextResponse.json({ error: '画面修复失败，请重试' }, { status: 500 });
    }

    // Save result to user works
    const { supabase } = await getAuthUser(request);
    await supabase.from('user_works').insert({
      user_id: user.id,
      work_type: 'image',
      file_url: resultUrls[0],
      prompt: `画面擦除修复: ${customPrompt || '去除标注区域'}`,
      credits_cost: 2,
    });

    return NextResponse.json({
      success: true,
      result_url: resultUrls[0],
      repair_prompt: repairPrompt,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '画面擦除失败';
    console.error('Eraser error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
