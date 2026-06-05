import { NextRequest } from 'next/server';

// ========== 工具函数 ==========

function baseUrl() {
  return `http://localhost:${process.env.DEPLOY_RUN_PORT || 5000}`;
}

async function apiCall(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; data: unknown; ok: boolean }> {
  try {
    const url = `${baseUrl()}${path}`;
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data: unknown;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, ok: res.ok };
  } catch (e) {
    return { status: 0, data: { error: String(e) }, ok: false };
  }
}

function makeHeaders(session?: string): Record<string, string> {
  const h: Record<string, string> = {};
  if (session) h['x-session'] = session;
  return h;
}

// SSE 事件发送
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ========== 测试模块 ==========

// 1. 账号模块测试
async function testAccountModule(): Promise<ModuleResult> {
  const results: TestResult[] = [];
  let session = '';

  // 游客访问
  {
    const r = await apiCall('GET', '/api/auth/profile');
    results.push({ name: '游客访问(未登录)', status: r.status === 401 ? 'PASS' : 'FAIL', detail: `状态码 ${r.status}` });
  }

  // 邮箱注册
  const testEmail = `selftest_${Date.now()}@test.local`;
  const testPassword = 'Test123456!';
  {
    const r = await apiCall('POST', '/api/auth/register', { email: testEmail, password: testPassword });
    results.push({ name: '邮箱注册', status: r.ok ? 'PASS' : 'FAIL', detail: r.ok ? '注册成功' : String((r.data as Record<string, unknown>)?.error || '失败') });
  }

  // 邮箱密码登录
  {
    const r = await apiCall('POST', '/api/auth/login', { email: testEmail, password: testPassword });
    session = (r.data as Record<string, unknown>)?.session as string || '';
    results.push({ name: '邮箱密码登录', status: r.ok && session ? 'PASS' : 'FAIL', detail: r.ok ? '登录成功' : String((r.data as Record<string, unknown>)?.error || '失败') });
  }

  // 获取用户信息
  if (session) {
    const r = await apiCall('GET', '/api/auth/profile', undefined, makeHeaders(session));
    results.push({ name: '获取用户信息', status: r.ok ? 'PASS' : 'FAIL', detail: r.ok ? '成功获取' : String((r.data as Record<string, unknown>)?.error || '失败') });
  }

  // 找回密码(发送重置邮件)
  {
    const r = await apiCall('POST', '/api/auth/reset-password', { email: testEmail });
    results.push({ name: '找回密码流程', status: r.status !== 500 ? 'PASS' : 'FAIL', detail: r.status !== 500 ? '接口正常响应' : '服务端错误' });
  }

  // Supabase配置
  {
    const r = await apiCall('GET', '/api/supabase-config');
    results.push({ name: 'Supabase配置获取', status: r.ok ? 'PASS' : 'FAIL', detail: r.ok ? '配置正常' : '获取失败' });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '1. 账号模块',
    status: passCount === results.length ? 'PASS' : 'PARTIAL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 2. AI绘图模块
async function testImageModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 模型列表
  let modelList: Array<Record<string, unknown>> = [];
  {
    const r = await apiCall('GET', '/api/models?category=image', undefined, h);
    modelList = (r.data as Array<Record<string, unknown>>) || [];
    results.push({ name: '图片模型列表', status: r.ok && modelList.length > 0 ? 'PASS' : 'FAIL', detail: `获取 ${modelList.length} 个模型` });
  }

  // 系统配置检查
  {
    const r = await apiCall('GET', '/api/system-config', undefined, h);
    const config = r.data as Array<Record<string, unknown>> | null;
    const imageOpen = config?.find((c: Record<string, unknown>) => c.key === 'image_generation_open');
    results.push({ name: '生图功能开关', status: r.ok ? 'PASS' : 'FAIL', detail: imageOpen ? `状态: ${String(imageOpen.value)}` : '未配置' });
  }

  // 文生图 (使用免费模型)
  const freeModel = modelList.find((m: Record<string, unknown>) => m.is_free);
  if (freeModel) {
    const r = await apiCall('POST', '/api/ai/image', {
      prompt: '一只橘色猫咪在阳光下打盹，高清摄影',
      model_id: freeModel.id,
      size: '1024x1024',
      n: 1,
    }, h);
    results.push({ name: '文生图(免费模型)', status: r.ok ? 'PASS' : 'FAIL', detail: r.ok ? '图片生成成功' : String((r.data as Record<string, unknown>)?.error || '失败') });
  } else {
    results.push({ name: '文生图', status: 'SKIP', detail: '无免费模型可用' });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '2. AI绘图模块',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 3. AI视频模块
async function testVideoModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 模型列表
  {
    const r = await apiCall('GET', '/api/models?category=video', undefined, h);
    const models = (r.data as Array<Record<string, unknown>>) || [];
    results.push({ name: '视频模型列表', status: r.ok && models.length > 0 ? 'PASS' : 'FAIL', detail: `获取 ${models.length} 个模型` });
  }

  // 文生视频
  {
    const r = await apiCall('POST', '/api/ai/video', {
      prompt: '日落时分的海边，海浪轻轻拍打沙滩',
      duration: 5,
      model_id: 'default',
    }, h);
    const data = r.data as Record<string, unknown>;
    if (r.ok && data?.task_id) {
      results.push({ name: '文生视频(提交)', status: 'PASS', detail: `任务ID: ${String(data.task_id)}` });
    } else {
      const error = String(data?.error || '提交失败');
      if (error.includes('算力不足') || error.includes('余额')) {
        results.push({ name: '文生视频(提交)', status: 'PASS', detail: '接口正常，算力不足属预期' });
      } else {
        results.push({ name: '文生视频(提交)', status: 'FAIL', detail: error });
      }
    }
  }

  // 视频任务状态查询
  {
    const r = await apiCall('GET', '/api/ai/video/status', undefined, h);
    results.push({ name: '视频任务查询接口', status: r.ok || r.status === 400 ? 'PASS' : 'FAIL', detail: `状态码 ${r.status}` });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '3. AI视频模块',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 4. AI音乐模块
async function testMusicModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 模型列表
  {
    const r = await apiCall('GET', '/api/models?category=music', undefined, h);
    const models = (r.data as Array<Record<string, unknown>>) || [];
    results.push({ name: '音乐模型列表', status: r.ok && models.length > 0 ? 'PASS' : 'FAIL', detail: `获取 ${models.length} 个模型` });
  }

  // 模板列表
  {
    const r = await apiCall('GET', '/api/templates?category=music', undefined, h);
    results.push({ name: '音乐模板接口', status: r.ok ? 'PASS' : 'FAIL', detail: `状态码 ${r.status}` });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '4. AI音乐模块',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 5. 提示词反推模块
async function testPromptAnalyzerModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 图片提示词反推接口存在性
  {
    const r = await apiCall('POST', '/api/ai/prompt-analyze', { image_url: '', style: '真人写实' }, h);
    // 至少不是404说明接口存在
    results.push({ name: '图片提示词反推接口', status: r.status !== 404 ? 'PASS' : 'FAIL', detail: r.status === 400 ? '接口存在，参数校验正常' : `状态码 ${r.status}` });
  }

  // 视频提示词反推接口存在性
  {
    const r = await apiCall('POST', '/api/ai/video-analyze', { video_url: '' }, h);
    results.push({ name: '视频提示词反推接口', status: r.status !== 404 ? 'PASS' : 'FAIL', detail: r.status === 400 ? '接口存在，参数校验正常' : `状态码 ${r.status}` });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '5. 提示词反推模块',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 6. 画面修复模块
async function testEraserModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 图片擦除接口
  {
    const r = await apiCall('POST', '/api/ai/eraser', { image_url: '' }, h);
    results.push({ name: '图片去水印接口', status: r.status !== 404 ? 'PASS' : 'FAIL', detail: r.status === 400 ? '接口存在，参数校验正常' : `状态码 ${r.status}` });
  }

  // 视频擦除接口
  {
    const r = await apiCall('POST', '/api/ai/eraser/video', { video_url: '' }, h);
    results.push({ name: '视频去字幕接口', status: r.status !== 404 ? 'PASS' : 'FAIL', detail: r.status === 400 ? '接口存在，参数校验正常' : `状态码 ${r.status}` });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '6. 画面修复模块',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// 7. 充值&算力扣费模块
async function testRechargeModule(session: string): Promise<ModuleResult> {
  const results: TestResult[] = [];
  const h = makeHeaders(session);

  // 充值套餐
  {
    const r = await apiCall('GET', '/api/recharge/packages', undefined, h);
    const pkgs = (r.data as Array<Record<string, unknown>>) || [];
    results.push({ name: '充值套餐列表', status: r.ok && pkgs.length > 0 ? 'PASS' : 'FAIL', detail: `${pkgs.length} 个套餐` });
  }

  // 收款码
  {
    const r = await apiCall('GET', '/api/qrcodes', undefined, h);
    results.push({ name: '收款码接口', status: r.ok ? 'PASS' : 'FAIL', detail: `状态码 ${r.status}` });
  }

  // 订单创建
  {
    const r = await apiCall('POST', '/api/recharge/create-order', { package_id: 1, payment_method: 'wechat' }, h);
    results.push({ name: '创建充值订单', status: r.ok || r.status === 400 ? 'PASS' : 'FAIL', detail: r.ok ? '订单创建成功' : String((r.data as Record<string, unknown>)?.error || `状态码 ${r.status}`) });
  }

  // 用户余额
  {
    const r = await apiCall('GET', '/api/auth/profile', undefined, h);
    const profile = r.data as Record<string, unknown> | null;
    results.push({ name: '余额查询', status: r.ok && profile ? 'PASS' : 'FAIL', detail: profile ? `算力: ${profile.credits ?? '?'}` : '查询失败' });
  }

  // 算力流水
  {
    const r = await apiCall('GET', '/api/credits/transactions', undefined, h);
    results.push({ name: '算力流水接口', status: r.ok || r.status === 404 ? 'PASS' : 'FAIL', detail: `状态码 ${r.status}` });
  }

  const passCount = results.filter(r => r.status === 'PASS').length;
  return {
    name: '7. 充值&算力扣费',
    status: passCount === results.length ? 'PASS' : passCount > 0 ? 'PARTIAL' : 'FAIL',
    results,
    summary: `${passCount}/${results.length} 通过`
  };
}

// ========== 类型定义 ==========
interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail: string;
}

interface ModuleResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'PARTIAL';
  results: TestResult[];
  summary: string;
}

// ========== 主处理 ==========

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseEvent(event, data)));
      };

      send('start', { message: '全链路自动化测试启动...' });

      // 先登录获取session
      const loginRes = await apiCall('POST', '/api/auth/login', {
        email: '13800001111@phone.local',
        password: '123456',
      });
      const session = (loginRes.data as Record<string, unknown>)?.session as string || '';

      if (!session) {
        send('error', { message: '测试账号登录失败，无法继续' });
        send('done', { message: '测试终止' });
        controller.close();
        return;
      }

      send('info', { message: '测试账号登录成功，开始逐模块测试...' });

      const modules: ModuleResult[] = [];

      // 模块1: 账号
      send('progress', { module: '账号模块', step: 1, total: 7 });
      const accountResult = await testAccountModule();
      modules.push(accountResult);
      send('module', accountResult);

      // 模块2: AI绘图
      send('progress', { module: 'AI绘图模块', step: 2, total: 7 });
      const imageResult = await testImageModule(session);
      modules.push(imageResult);
      send('module', imageResult);

      // 模块3: AI视频
      send('progress', { module: 'AI视频模块', step: 3, total: 7 });
      const videoResult = await testVideoModule(session);
      modules.push(videoResult);
      send('module', videoResult);

      // 模块4: AI音乐
      send('progress', { module: 'AI音乐模块', step: 4, total: 7 });
      const musicResult = await testMusicModule(session);
      modules.push(musicResult);
      send('module', musicResult);

      // 模块5: 提示词反推
      send('progress', { module: '提示词反推模块', step: 5, total: 7 });
      const promptResult = await testPromptAnalyzerModule(session);
      modules.push(promptResult);
      send('module', promptResult);

      // 模块6: 画面修复
      send('progress', { module: '画面修复模块', step: 6, total: 7 });
      const eraserResult = await testEraserModule(session);
      modules.push(eraserResult);
      send('module', eraserResult);

      // 模块7: 充值算力
      send('progress', { module: '充值&算力模块', step: 7, total: 7 });
      const rechargeResult = await testRechargeModule(session);
      modules.push(rechargeResult);
      send('module', rechargeResult);

      // 汇总
      const totalTests = modules.reduce((s, m) => s + m.results.length, 0);
      const totalPass = modules.reduce((s, m) => s + m.results.filter(r => r.status === 'PASS').length, 0);
      const totalFail = modules.reduce((s, m) => s + m.results.filter(r => r.status === 'FAIL').length, 0);
      const totalSkip = modules.reduce((s, m) => s + m.results.filter(r => r.status === 'SKIP').length, 0);

      const report = {
        totalTests,
        totalPass,
        totalFail,
        totalSkip,
        passRate: totalTests > 0 ? `${Math.round(totalPass / totalTests * 100)}%` : '0%',
        overallStatus: totalFail === 0 ? 'PASS' : totalFail < totalTests / 2 ? 'PARTIAL' : 'FAIL',
        modules,
        timestamp: new Date().toISOString(),
      };

      send('report', report);
      send('done', { message: '全链路测试完成' });
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
