'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useSessionState } from '@/hooks/use-session-state';
import { useActionThrottle } from '@/hooks/use-action-throttle';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, Volume2, Download, Plus, FolderPlus, FolderInput
} from 'lucide-react';

interface Template {
  id: string;
  name: string;
  sub_category: string;
  description: string;
  prompt_template: string;
  credits_cost: number;
  is_vip_only: boolean;
}

interface MusicWork {
  id: string;
  file_url: string;
  prompt: string;
  metadata: string;
  created_at: string;
}

const musicStyles = [
  { id: 'pop', name: '流行', icon: '🎵', desc: '现代流行曲风' },
  { id: 'guofeng', name: '古风', icon: '🏮', desc: '中国传统风格' },
  { id: 'electronic', name: '电子', icon: '🎧', desc: 'EDM电子舞曲' },
  { id: 'rap', name: '说唱', icon: '🎤', desc: 'Hip-hop风格' },
  { id: 'instrumental', name: '纯音乐', icon: '🎹', desc: '器乐纯音乐' },
];

export default function CreateMusicPage() {
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('pop');
  const [resultUrl, setResultUrl] = useSessionState<string>('music_result_url', '');
  const [resultLyrics, setResultLyrics] = useSessionState<string>('music_result_lyrics', '');
  const [templates, setTemplates] = useState<Template[]>([]);

  // Project selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('selectedProjectId') || ''; } catch { return ''; }
  });
  const [hydrated, setHydrated] = useState(false);

  // History works
  const [historyWorks, setHistoryWorks] = useState<MusicWork[]>([]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=music');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        const saved = localStorage.getItem('selectedProjectId');
        if (saved && !data.projects.some((p: { id: string }) => p.id === saved)) {
          setSelectedProjectId('');
          localStorage.removeItem('selectedProjectId');
        }
      }
      setHydrated(true);
    } catch (err) {
      console.error(err);
      setHydrated(true);
    }
  }, []);

  const fetchExistingWorks = useCallback(async () => {
    try {
      const res = await fetch('/api/works?type=music&unassigned=true', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.works) {
        setHistoryWorks(data.works);
      }
    } catch (err) {
      console.error('Fetch existing works error:', err);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
    fetchProjects();
    fetchExistingWorks();
  }, [fetchTemplates, fetchProjects, fetchExistingWorks]);

  // 限流：3秒冷却 + 请求中锁定
  const generateThrottle = useActionThrottle(
    async () => {
      if (!user) { router.push('/login'); return; }
      const cost = 10;
      if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

      setResultUrl('');
      try {
        const res = await fetch('/api/ai/music', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ prompt: prompt || lyrics, style: selectedStyle, lyrics, project_id: selectedProjectId || undefined }),
        });
        const data = await res.json();
        if (res.status === 429) { alert('请求频繁，请稍后重试'); return; }
        const audioUrl = data.audio_url || data.url;
        if (audioUrl) {
          setResultUrl(audioUrl);
          setResultLyrics(data.lyrics || '');
          if (data.remaining_credits !== undefined) updateCredits(data.remaining_credits);
          fetchExistingWorks();
        } else {
          alert(data.error || '生成失败');
        }
      } catch { alert('生成失败，请重试'); }
    },
    { cooldown: 3000 },
  );

  const handleCreateProject = async () => {
    const now = new Date();
    const dateName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}项目`;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: dateName }),
      });
      const data = await res.json();
      if (data.project) {
        setSelectedProjectId(data.project.id);
        localStorage.setItem('selectedProjectId', data.project.id);
        fetchProjects();
      } else if (res.status === 409) {
        await fetchProjects();
        const projRes = await fetch('/api/projects', { headers: getAuthHeaders() });
        if (projRes.ok) {
          const projData = await projRes.json();
          const existing = projData.projects?.find((p: { name: string }) => p.name === dateName);
          if (existing) {
            setSelectedProjectId(existing.id);
            localStorage.setItem('selectedProjectId', existing.id);
          }
        }
      } else {
        console.error('创建项目失败:', data.error);
      }
    } catch (e) {
      console.error('创建项目失败:', e);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
            AI音乐创作
          </h1>
          <p className="text-muted-foreground mt-2">文字生成歌曲、AI伴奏、多曲风切换</p>
        </div>

        {/* 等待localStorage恢复完成前不渲染项目区域，避免新建项目页面闪现 */}
        {!hydrated ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : !selectedProjectId ? (
          <div className="space-y-6">
            {/* 新建项目 */}
            <Card className="border-border/50 bg-card/50 backdrop-blur">
              <CardContent className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500/20 to-pink-500/20 flex items-center justify-center mb-4">
                  <Plus className="w-8 h-8 text-rose-400" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">新建项目</h2>
                <p className="text-muted-foreground mb-4 text-sm max-w-md">创建一个项目来开始AI创作，所有生成的作品将保存在项目中</p>
                <Button
                  onClick={handleCreateProject}
                  className="bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white px-6 py-2"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  新建项目
                </Button>
              </CardContent>
            </Card>
            {/* 选择已有项目 */}
            {projects.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">或选择已有项目</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {projects.map((project: { id: string; name: string; cover_url?: string | null; default_cover?: string | null; created_at?: string }) => {
                    const cover = project.cover_url || project.default_cover;
                    return (
                      <button
                        key={project.id}
                        onClick={() => {
                          setSelectedProjectId(project.id);
                          localStorage.setItem('selectedProjectId', project.id);
                        }}
                        className="group text-left rounded-xl border border-border/50 bg-card/50 backdrop-blur overflow-hidden hover:border-rose-500/50 hover:bg-rose-500/5 transition-all duration-200"
                      >
                        <div className="aspect-[4/3] relative bg-muted/30 overflow-hidden">
                          {cover ? (
                            <img src={cover} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FolderInput className="h-8 w-8 text-muted-foreground/30" />
                            </div>
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                          {project.created_at && (
                            <p className="text-xs text-muted-foreground mt-0.5">{new Date(project.created_at).toLocaleDateString('zh-CN')}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Project bar */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FolderPlus className="w-4 h-4" />
              <span>当前项目：{projects.find(p => p.id === selectedProjectId)?.name || '未命名'}</span>
              <Button variant="ghost" size="sm" className="ml-auto text-xs" onClick={() => {
                setSelectedProjectId('');
                localStorage.removeItem('selectedProjectId');
              }}>切换项目</Button>
            </div>

            {/* Style Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">选择曲风</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3">
                  {musicStyles.map((style) => (
                    <div
                      key={style.id}
                      className={`p-3 rounded-lg border cursor-pointer text-center transition-all hover:-translate-y-0.5 ${
                        selectedStyle === style.id
                          ? 'border-rose-500 bg-rose-500/10'
                          : 'border-border/50 hover:border-rose-500/30'
                      }`}
                      onClick={() => setSelectedStyle(style.id)}
                    >
                      <div className="text-2xl mb-1">{style.icon}</div>
                      <p className="text-xs font-medium">{style.name}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Prompt */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">创作描述</CardTitle>
                <CardDescription>描述你想要的音乐风格和主题</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="例如：一首关于夏日海边的流行歌曲，轻快明朗的旋律..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                />
                <div className="space-y-2">
                  <Label>自定义歌词（可选）</Label>
                  <Textarea
                    placeholder="输入自定义歌词，留空则AI自动生成..."
                    value={lyrics}
                    onChange={(e) => setLyrics(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {(profile?.free_credits ?? 0) > 0 ? (
                      <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">免费</Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">免费额度已用·将扣算力</Badge>
                    )}
                  </span>
                </div>
                {(profile?.free_credits ?? 0) <= 0 && (
                  <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-1.5">
                    免费额度已用完，生成将消耗付费算力
                  </p>
                )}
                <Button
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-medium"
                  onClick={() => generateThrottle.run()}
                  disabled={generateThrottle.disabled || ((typeof prompt !== 'string' || !prompt.trim()) && (typeof lyrics !== 'string' || !lyrics.trim()))}
                >
                  {generateThrottle.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {generateThrottle.loading ? '生成中...' : generateThrottle.cooling ? `${generateThrottle.cooldownRemaining}秒后可再次生成` : '开始创作音乐'}
                </Button>
              </CardContent>
            </Card>

            {/* Current Result */}
            {resultUrl && (
              <Card className="border-border/50">
                <CardHeader className="pb-3"><CardTitle className="text-base">生成结果</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center">
                      <Volume2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <audio src={resultUrl} controls className="w-full" />
                    </div>
                  </div>
                  {resultLyrics && (
                    <div className="p-4 rounded-lg bg-muted/30">
                      <p className="text-sm font-medium mb-2">歌词</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{resultLyrics}</p>
                    </div>
                  )}
                  <Button variant="outline" className="w-full" onClick={() => window.open(resultUrl, '_blank')}>
                    <Download className="w-4 h-4 mr-2" /> 下载音频
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* History Works */}
            {historyWorks.length > 0 && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">历史作品</CardTitle>
                  <CardDescription>之前生成的音乐作品</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {historyWorks.map((work) => (
                    <div key={work.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-rose-500/50 to-pink-500/50 flex items-center justify-center shrink-0">
                        <Volume2 className="w-5 h-5 text-white" />
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
            <h3 className="text-lg font-semibold">音乐模板</h3>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer border-border/50 hover:border-rose-500/30 transition-all hover:-translate-y-0.5"
                onClick={() => { setPrompt(tpl.prompt_template); setSelectedStyle(tpl.sub_category); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                    </div>
                    {tpl.is_vip_only && <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs shrink-0 ml-2">VIP</Badge>}
                  </div>
                  <div className="text-xs mt-2">{(profile?.free_credits ?? 0) > 0 ? <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">免费</Badge> : <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 text-xs">VIP</Badge>}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
