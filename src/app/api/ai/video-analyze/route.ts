import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils, Message } from 'coze-coding-dev-sdk';
import { getAuthUser } from '@/lib/auth-helpers';

const SYSTEM_PROMPT = `你是专业视频逆向解析师，依托多模态视觉能力，接收用户上传的视频，输出适配Seedance等AI视频生成工具的精准提示词。

执行规则：
1. 拆分全片分镜，标注每段时间轴、镜头景别、运镜方式、光影色调、人物造型、场景环境、画面细节；
2. 整理两套内容：
   ①精简关键词提示词（直接丢文生视频）
   ②完整版结构化Seedance Prompt（固定格式：【画面风格】+【分镜时序】+【摄影机运动】+【光影配色】+【环境细节】+【配乐音效】）
3. 不闲聊、不冗余，统一Markdown排版。

固定输出格式（严格遵守）：

## 精简关键词提示词
（直接可用的文生视频关键词，按主次排列，关键词用逗号分隔）

## 结构化Seedance Prompt

【画面风格】
xxx

【分镜时序】
xxx

【摄影机运动】
xxx

【光影配色】
xxx

【环境细节】
xxx

【配乐音效】
xxx`;

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { videoUrl } = body as { videoUrl?: string };

    if (!videoUrl) {
      return NextResponse.json({ error: '请提供视频' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages: Message[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: videoUrl },
          },
          {
            type: 'text',
            text: '请分析这段视频，按固定格式输出提示词。',
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
  } catch (error: unknown) {
    console.error('Video analyze error:', error);
    const message = error instanceof Error ? error.message : '视频解析失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
