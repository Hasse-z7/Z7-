'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Download, Sparkles, Loader2, MonitorSmartphone, ArrowLeft
} from 'lucide-react';
import { usePersistedState } from '@/hooks/use-persisted-state';

interface AIModel {
  id: string;
  name: string;
  endpoint_id: string;
  category: string;
  description: string;
}

interface DigitalHumanWork {
  id: string;
  file_url: string;
  prompt: string;
  work_type: string;
  created_at: string;
}

const avatars = [
  { id: 'news_anchor', name: '新闻主播', icon: '📺', desc: '专业新闻播报' },
  { id: 'teacher', name: '知识讲师', icon: '👨‍🏫', desc: '教学讲解' },
  { id: 'marketer', name: '营销达人', icon: '💼', desc: '产品推广' },
  { id: 'assistant', name: '智能助手', icon: '🤖', desc: '通用数字人' },
];

export default function CreateDigitalHumanPage() {
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get('project_id') || '';

  const [prompt, setPrompt] = usePersistedState<string>('digital_human_prompt', '');
  const [selectedAvatar, setSelectedAvatar] = useState('news_anchor');
  const [voices, setVoices] = useState<AIModel[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('zh_female_xiaohe_uranus_bigtts');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');

  // Project selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectIdFromUrl);

  // History works
  const [historyWorks, setHistoryWorks] = useState<DigitalHumanWork[]>([]);

  const fetchVoices = useCallback(async () => {
    try {
      const res = await fetch('/api/models?category=tts');
      const data = await res.json();
      if (data.models) {
        setVoices(data.models);
        const saved = localStorage.getItem('selected_tts_voice');
        if (saved && data.models.some((m: AIModel) => m.endpoint_id === saved)) {
          setSelectedVoice(saved);
        } else if (data.models.length > 0) {
          setSelectedVoice(data.models[0].endpoint_id);
        }
      }
    } catch (err) {
      console.error('Fetch voices error:', err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        const saved = projectIdFromUrl || localStorage.getItem('selectedProjectId_digital_human');
        if (saved && data.projects.some((p: { id: string }) => p.id === saved)) {
          setSelectedProjectId(saved);
        }
      }
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  }, [projectIdFromUrl]);

  const fetchExistingWorks = useCallback(async () => {
    try {
      const res = await fetch('/api/works?type=digital_human', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.works) {
        setHistoryWorks(data.works);
      }
    } catch (err) {
      console.error('Fetch existing works error:', err);
    }
  }, []);

  useEffect(() => { fetchVoices(); fetchProjects(); fetchExistingWorks(); }, [fetchVoices, fetchProjects, fetchExistingWorks]);

  const handleGenerate = async () => {
    if (!user) { router.push('/login'); return; }
    const cost = selectedAvatar === 'marketer' ? 30 : 25;
    if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

    setLoading(true);
    setResultUrl('');
    try {
      const res = await fetch('/api/ai/digital-human', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          prompt,
          avatar_style: selectedAvatar,
          voice_type: selectedVoice,
          orientation,
          project_id: selectedProjectId || undefined,
        }),
      });
      const data = await res.json();
      const generatedUrl = data.audio_url || data.video_url || data.url;
      if (generatedUrl) {
        setResultUrl(generatedUrl);
        if (data.remaining_credits !== undefined) {
          updateCredits(data.remaining_credits);
        }
        fetchExistingWorks();
      } else {
        alert(data.error || '生成失败');
      }
    } catch {
      alert('生成失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 返回按钮：保存当前内容到localStorage，3分钟有效期
  const handleBack = () => {
    if (selectedProjectId) {
      router.push(`/projects/${selectedProjectId}`);
    } else {
      router.push('/projects');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                AI数字人
              </h1>
              <p className="text-muted-foreground mt-1">文字生成数字人播报视频，多形象多音色可选</p>
            </div>
          </div>
          {/* 项目选择器 */}
          <div className="flex items-center gap-2">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="appearance-none rounded-lg border border-border/50 bg-muted/50 px-3 py-2 pr-8 text-sm text-foreground max-w-[200px] truncate"
            >
              <option value="">选择项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Avatar Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">选择数字人形象</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3">
                  {avatars.map((av) => (
                    <div
                      key={av.id}
                      className={`p-3 rounded-lg border cursor-pointer text-center transition-all hover:-translate-y-0.5 ${
                        selectedAvatar === av.id
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border/50 hover:border-amber-500/30'
                      }`}
                      onClick={() => setSelectedAvatar(av.id)}
                    >
                      <div className="text-2xl mb-1">{av.icon}</div>
                      <p className="text-xs font-medium">{av.name}</p>
                      <p className="text-xs text-muted-foreground">{av.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Voice Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">选择音色</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {voices.map((v) => (
                    <div
                      key={v.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-all hover:-translate-y-0.5 ${
                        selectedVoice === v.endpoint_id
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-border/50 hover:border-amber-500/30'
                      }`}
                      onClick={() => {
                        setSelectedVoice(v.endpoint_id);
                        localStorage.setItem('selected_tts_voice', v.endpoint_id);
                      }}
                    >
                      <p className="text-sm font-medium">{v.name}</p>
                      <p className="text-xs text-muted-foreground">{v.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Script Input */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">播报文案</CardTitle>
                <CardDescription>输入数字人需要播报的文字内容</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="例如：大家好，欢迎来到今天的科技前沿节目。今天我们将为大家介绍最新的人工智能技术突破..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">画面方向:</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={orientation === 'horizontal' ? 'default' : 'outline'}
                        onClick={() => setOrientation('horizontal')}
                      >
                        <MonitorSmartphone className="w-4 h-4 mr-1" /> 横屏
                      </Button>
                      <Button
                        size="sm"
                        variant={orientation === 'vertical' ? 'default' : 'outline'}
                        onClick={() => setOrientation('vertical')}
                      >
                        📱 竖屏
                      </Button>
                    </div>
                  </div>
                  <span className="ml-auto text-sm text-muted-foreground">
                    {(profile?.free_credits ?? 0) > 0 ? <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">免费</Badge> : <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 text-xs">VIP</Badge>}
                  </span>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {loading ? '生成中...' : '开始生成数字人视频'}
                </Button>
              </CardContent>
            </Card>

            {/* Current Result */}
            {resultUrl && (
              <Card className="border-border/50">
                <CardHeader className="pb-3"><CardTitle className="text-base">生成结果</CardTitle></CardHeader>
                <CardContent>
                  <video src={resultUrl} controls className="w-full rounded-lg max-h-[500px]" />
                  <Button variant="outline" className="w-full mt-4" onClick={() => window.open(resultUrl, '_blank')}>
                    <Download className="w-4 h-4 mr-2" /> 下载视频
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* History Works */}
            {historyWorks.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">历史作品</CardTitle>
                  <CardDescription>之前生成的数字人作品</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {historyWorks.map((work) => (
                    <div key={work.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500/50 to-orange-500/50 flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{work.prompt || '无描述'}</p>
                        <p className="text-xs text-muted-foreground">{new Date(work.created_at).toLocaleString()}</p>
                      </div>
                      {work.file_url && (
                        <Button variant="ghost" size="sm" onClick={() => window.open(work.file_url, '_blank')}>
                          <Download className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  选择数字人形象和音色，输入播报文案，AI将为你生成数字人播报视频。
                  营销达人消耗30算力点，其他形象消耗25算力点。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
