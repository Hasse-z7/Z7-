import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils, Message } from 'coze-coding-dev-sdk';
import { getAuthUser } from '@/lib/auth-helpers';

const SYSTEM_PROMPT = `你是一位专业AI绘图提示词反向解析师。你的工作是：接收用户上传的图片，逐项拆解画面元素，生成三套提示词。

拆解维度（必须逐项覆盖）：
- 主体人物（外貌、年龄、性别、姿态）
- 服饰（款式、材质、颜色、细节）
- 五官神态（表情、眼神、妆容）
- 场景环境（室内/室外、地形、建筑、植被）
- 光影（光源方向、色温、阴影、高光）
- 氛围（情绪基调、意境、风格化元素）
- 画质参数（分辨率标注、渲染引擎标注）
- 特效元素（粒子、光晕、雾气、镜头效果）
- 构图（视角、景别、透视、画面分割）
- 渲染引擎标注

输出规则：
1. 中文正向提示词：适配国内可灵、即梦、剪映AI生图/生视频。关键词连贯，分主次描述，优先画面核心元素。不要用英文，全部中文描述。
2. 英文生成提示词：适配Midjourney、Pika视频生成。写实摄影标注相机型号(如Sony A7R IV)、8K、UE5、Octane Render、电影级实拍等参数。用逗号分隔关键词。
3. 反向负面提示词：根据画面风格自动生成避坑关键词，剔除畸形、崩坏、低画质、画风错乱等内容。中英文混合，逗号分隔。

固定输出格式（严格遵守，不额外闲聊、不冗余文案）：

【中文正向提示词】
（中文描述，关键词连贯）

【英文生成提示词】
（英文关键词，逗号分隔）

【反向负面提示词】
（中英文混合，逗号分隔）

用户无额外要求时默认按【真人写实风格】生成提示词，用户指定画风则按指定风格改写。`;

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { imageUrl, style } = body;

    if (!imageUrl) {
      return NextResponse.json({ error: '请上传图片' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const styleNote = style && style !== '真人写实'
      ? `用户指定画风：${style}，请按此风格改写提示词。`
      : '默认按真人写实风格生成提示词。';

    const messages: Message[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `请反向解析这张图片的提示词。${styleNote}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
              detail: 'high',
            },
          },
        ],
      },
    ];

    const stream = client.stream(messages, {
      model: 'doubao-seed-2-0-pro-260215',
      temperature: 0.5,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              const text = chunk.content.toString();
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: '生成失败' })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Prompt analyze error:', error);
    return NextResponse.json({ error: '解析失败，请重试' }, { status: 500 });
  }
}
