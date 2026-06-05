'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Shield, Play, CheckCircle2, XCircle, Clock, SkipForward, ChevronDown, ChevronRight, AlertTriangle, FileText, RotateCcw } from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'running';
  message: string;
  detail?: string;
  duration?: number;
}

interface ModuleResult {
  module: string;
  tests: TestResult[];
  status: 'pass' | 'fail' | 'running';
  duration?: number;
}

interface TestReport {
  totalDuration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  overallStatus: 'PASS' | 'PARTIAL_FAIL';
  modules: ModuleResult[];
  failures: Array<{ module: string; test: string; message: string }>;
  timestamp: string;
}

export default function SelfTestPage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [modules, setModules] = useState<ModuleResult[]>([]);
  const [report, setReport] = useState<TestReport | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<number>>(new Set());
  const [currentModule, setCurrentModule] = useState<string>('');

  const toggleModule = (index: number) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const runTest = useCallback(async () => {
    if (!user) { router.push('/login'); return; }
    if (!(profile as { is_admin?: boolean })?.is_admin) return;

    setRunning(true);
    setModules([]);
    setReport(null);
    setCurrentModule('');

    const token = (user as { session?: { access_token?: string } })?.session?.access_token || localStorage.getItem('sb-access-token') || '';

    try {
      const response = await fetch('/api/admin/self-test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': token,
        },
      });

      if (!response.ok || !response.body) {
        setRunning(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ') && line.trim() !== 'event: ') {
            const eventType = line.slice(7).trim();
            // next line is data
            continue;
          }
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const prevLine = lines[lines.indexOf(line) - 1];
              const eventType = prevLine?.startsWith('event: ') ? prevLine.slice(7).trim() : '';

              if (eventType === 'module_start') {
                setCurrentModule(data.module || '');
              } else if (eventType === 'module_done') {
                setModules(prev => [...prev, data as ModuleResult]);
              } else if (eventType === 'report') {
                setReport(data as TestReport);
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
    } catch (e) {
      console.error('Self-test error:', e);
    } finally {
      setRunning(false);
      setCurrentModule('');
    }
  }, [user, profile, router]);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skip': return <SkipForward className="w-4 h-4 text-amber-500" />;
      case 'running': return <Clock className="w-4 h-4 text-sky-500 animate-pulse" />;
      default: return null;
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      fail: 'bg-red-500/20 text-red-400 border-red-500/30',
      running: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${colors[status] || ''}`}>
        {status === 'pass' ? '通过' : status === 'fail' ? '失败' : status === 'running' ? '运行中' : status}
      </span>
    );
  };

  const isAdmin = (profile as { is_admin?: boolean })?.is_admin;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-100 mb-2">权限不足</h2>
          <p className="text-slate-400">仅管理员可访问自检工具</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <Shield className="w-6 h-6 text-sky-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-100">全链路自检引擎</h1>
              <p className="text-sm text-slate-400">一键自动化测试全部功能模块</p>
            </div>
          </div>
          <button
            onClick={runTest}
            disabled={running}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all ${
              running
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-sky-500 hover:bg-sky-400 text-white shadow-lg shadow-sky-500/20'
            }`}
          >
            {running ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                检测中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                一键全测
              </>
            )}
          </button>
        </div>

        {/* 运行中提示 */}
        {running && currentModule && (
          <div className="mb-6 p-4 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sky-300 font-medium">正在测试: {currentModule}</span>
          </div>
        )}

        {/* 模块测试结果 */}
        {modules.length > 0 && (
          <div className="space-y-3 mb-8">
            {modules.map((mod, idx) => (
              <div key={idx} className="rounded-xl bg-slate-900/70 border border-slate-700/50 overflow-hidden">
                <button
                  onClick={() => toggleModule(idx)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedModules.has(idx) ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="font-medium text-slate-100">{mod.module}</span>
                    {statusBadge(mod.status)}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-slate-400">
                    <span>{mod.tests.filter(t => t.status === 'pass').length}/{mod.tests.length} 通过</span>
                    {mod.duration && <span>{(mod.duration / 1000).toFixed(1)}s</span>}
                  </div>
                </button>

                {expandedModules.has(idx) && (
                  <div className="border-t border-slate-700/50">
                    {mod.tests.map((test, ti) => (
                      <div key={ti} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/50 last:border-0">
                        <div className="mt-0.5">{statusIcon(test.status)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-200">{test.name}</span>
                            {test.duration && (
                              <span className="text-xs text-slate-500">{test.duration}ms</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{test.message}</p>
                          {test.detail && (
                            <p className="text-xs text-slate-500 mt-0.5 font-mono truncate">{test.detail}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 测试报告 */}
        {report && (
          <div className="rounded-xl bg-slate-900/70 border border-slate-700/50 p-6">
            <div className="flex items-center gap-3 mb-6">
              <FileText className="w-5 h-5 text-sky-500" />
              <h2 className="text-lg font-bold text-slate-100">测试报告</h2>
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                report.overallStatus === 'PASS'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>
                {report.overallStatus === 'PASS' ? '全部通过' : '部分故障'}
              </span>
            </div>

            {/* 统计概览 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: '总测试数', value: report.totalTests, color: 'text-slate-100' },
                { label: '通过', value: report.passedTests, color: 'text-emerald-400' },
                { label: '失败', value: report.failedTests, color: 'text-red-400' },
                { label: '跳过', value: report.skippedTests, color: 'text-amber-400' },
                { label: '总耗时', value: `${(report.totalDuration / 1000).toFixed(1)}s`, color: 'text-sky-400' },
              ].map((stat, i) => (
                <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/30 text-center">
                  <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* 各模块结果汇总 */}
            <div className="space-y-2 mb-6">
              {report.modules.map((mod, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    {statusIcon(mod.status)}
                    <span className="text-sm text-slate-200">{mod.module}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-emerald-400">{mod.tests.filter(t => t.status === 'pass').length}</span>
                    <span className="text-slate-600">/</span>
                    <span className="text-slate-300">{mod.tests.length}</span>
                    {mod.duration && <span className="text-slate-500 text-xs">{(mod.duration / 1000).toFixed(1)}s</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* 故障明细 */}
            {report.failures.length > 0 && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <h3 className="font-semibold text-red-400">故障明细</h3>
                </div>
                <div className="space-y-2">
                  {report.failures.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-slate-300">{f.module}</span>
                        <span className="text-slate-500 mx-1">/</span>
                        <span className="text-slate-200 font-medium">{f.test}</span>
                        <p className="text-xs text-red-300/70 mt-0.5">{f.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 报告元信息 */}
            <div className="mt-4 pt-4 border-t border-slate-700/30 flex items-center justify-between text-xs text-slate-500">
              <span>生成时间: {new Date(report.timestamp).toLocaleString('zh-CN')}</span>
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `self-test-report-${new Date().toISOString().slice(0, 10)}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1 text-sky-400 hover:text-sky-300 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                导出报告
              </button>
            </div>
          </div>
        )}

        {/* 空状态 */}
        {!running && modules.length === 0 && !report && (
          <div className="text-center py-20">
            <Shield className="w-20 h-20 text-slate-700 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-300 mb-2">准备就绪</h3>
            <p className="text-slate-500 mb-6">点击「一键全测」启动全链路自动化测试</p>
            <div className="max-w-md mx-auto text-left space-y-2">
              {[
                '1. 账号体系：注册/登录/找回密码',
                '2. AI绘图：文生图/图生图',
                '3. AI视频：文生/图生/首尾帧联动',
                '4. AI音乐：文字作曲',
                '5. 提示词反推：图片/视频反推',
                '6. 去水印去字幕：图片/视频修复',
                '7. 算力充值：套餐/订单/余额',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-sky-500/50" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
