'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, Volume2, Download
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
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [resultLyrics, setResultLyrics] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=music');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

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
        body: JSON.stringify({ prompt: prompt || lyrics, style: selectedStyle, lyrics }),
      });
      const data = await res.json();
      const audioUrl = data.audio_url || data.url;
      if (audioUrl) {
        setResultUrl(audioUrl);
        setResultLyrics(data.lyrics || '');
        if (data.remaining_credits !== undefined) {
          updateCredits(data.remaining_credits);
        }
      } else {
        alert(data.error || '生成失败');
      }
    } catch {
      alert('生成失败，请重试');
    } finally {
      setLoading(false);
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
                      <>消耗 <span className="text-cyan-400 font-bold">10</span> 算力点</>
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

            {/* Result */}
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
                  <div className="text-xs mt-2">{(profile?.free_credits ?? 0) > 0 ? <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">免费</Badge> : <span className="text-cyan-400">{tpl.credits_cost} 算力点</span>}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
