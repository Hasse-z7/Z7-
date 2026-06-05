'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, Volume2, Download, ArrowLeft
} from 'lucide-react';
import { usePersistedState } from '@/hooks/use-persisted-state';

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
  const searchParams = useSearchParams();
  const projectIdFromUrl = searchParams.get('project_id') || '';

  const [prompt, setPrompt] = usePersistedState<string>('music_prompt', '');
  const [lyrics, setLyrics] = usePersistedState<string>('music_lyrics', '');
  const [selectedStyle, setSelectedStyle] = useState('pop');
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultLyrics, setResultLyrics] = useState('');

  // Project selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectIdFromUrl);

  // History works
  const [historyWorks, setHistoryWorks] = useState<MusicWork[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        const saved = projectIdFromUrl || localStorage.getItem('selectedProjectId_music');
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
      const res = await fetch('/api/works?type=music', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.works) {
        setHistoryWorks(data.works);
      }
    } catch (err) {
      console.error('Fetch existing works error:', err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchExistingWorks();
  }, [fetchProjects, fetchExistingWorks]);

  const handleGenerate = async () => {
    if (!user) { router.push('/login'); return; }
    const cost = 10;
    if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

    setLoading(true);
    setResultUrl('');
    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt: prompt || lyrics, style: selectedStyle, lyrics, project_id: selectedProjectId || undefined }),
      });
      const data = await res.json();
      const audioUrl = data.audio_url || data.url;
      if (audioUrl) {
        setResultUrl(audioUrl);
        setResultLyrics(data.lyrics || '');
        if (data.remaining_credits !== undefined) {
          updateCredits(data.remaining_credits);
        }
        // Refresh history
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-rose-400 to-pink-400 bg-clip-text text-transparent">
                AI音乐创作
              </h1>
              <p className="text-muted-foreground mt-1">文字生成歌曲、AI伴奏、多曲风切换</p>
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
                      <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">VIP</Badge>
                    )}
                  </span>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={loading || (!prompt.trim() && !lyrics.trim())}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {loading ? '生成中...' : '开始创作音乐'}
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
            <Card className="border-border/50">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  选择曲风并描述你想要的音乐，AI将为你生成独一无二的作品。
                  每首音乐消耗10算力点。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
