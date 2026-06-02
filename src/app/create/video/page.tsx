'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Film, Play, Upload, Download, Sparkles, Loader2, Video, Clapperboard, ZoomIn
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

const videoStyles = [
  { id: 'short_film', name: '短视频口播', icon: '🎬', desc: '口播短视频' },
  { id: 'film_scene', name: '影视短片', icon: '🎥', desc: '电影级场景' },
  { id: 'landscape', name: '风景大片', icon: '🌄', desc: '自然风光' },
];

export default function CreateVideoPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [mode, setMode] = useState<'text2video' | 'img2video' | 'extend' | 'enhance'>('text2video');
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=video');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleGenerate = async () => {
    if (!user) { router.push('/login'); return; }
    const cost = mode === 'enhance' ? 15 : mode === 'extend' ? 20 : 25;
    if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

    setLoading(true);
    setResultUrl('');
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        body: JSON.stringify({ prompt, image_url: imageUrl, duration }),
      });
      const data = await res.json();
      if (data.video_url) {
        setResultUrl(data.video_url);
        await fetch('/api/works', { credentials: 'include',
          method: 'POST',
          body: JSON.stringify({
            title: prompt.slice(0, 50),
            work_type: 'video',
            file_url: data.video_url,
            prompt,
            metadata: { mode, duration },
          }),
        });
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            AI视频生成
          </h1>
          <p className="text-muted-foreground mt-2">文字或图片生成视频，支持多种视频创作模式</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text2video"><Film className="w-4 h-4 mr-1" />文生视频</TabsTrigger>
                <TabsTrigger value="img2video"><Clapperboard className="w-4 h-4 mr-1" />图生视频</TabsTrigger>
                <TabsTrigger value="extend"><Play className="w-4 h-4 mr-1" />视频延长</TabsTrigger>
                <TabsTrigger value="enhance"><ZoomIn className="w-4 h-4 mr-1" />画质增强</TabsTrigger>
              </TabsList>
            </Tabs>

            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">视频描述</CardTitle>
                <CardDescription>详细描述你想要生成的视频内容</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="例如：夕阳西下的海滩，海浪轻轻拍打沙滩，海鸥在天空中翱翔..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                />
                {(mode === 'img2video' || mode === 'extend' || mode === 'enhance') && (
                  <div className="space-y-2">
                    <Label>输入图片/视频URL</Label>
                    <Input
                      placeholder="输入图片或视频的URL地址"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm">时长(秒)</Label>
                    <Input type="number" min={3} max={30} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-24" />
                  </div>
                  <div className="ml-auto text-sm text-muted-foreground">
                    消耗 <span className="text-cyan-400 font-bold">{mode === 'enhance' ? 15 : mode === 'extend' ? 20 : 25}</span> 算力
                  </div>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {loading ? '生成中...' : '开始生成视频'}
                </Button>
              </CardContent>
            </Card>

            {resultUrl && (
              <Card className="border-border/50">
                <CardHeader className="pb-3"><CardTitle className="text-base">生成结果</CardTitle></CardHeader>
                <CardContent>
                  <video src={resultUrl} controls className="w-full rounded-lg max-h-[500px]" />
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" className="flex-1" onClick={() => window.open(resultUrl, '_blank')}>
                      <Download className="w-4 h-4 mr-2" /> 下载视频
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">视频模板</h3>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer border-border/50 hover:border-cyan-500/30 transition-all hover:-translate-y-0.5"
                onClick={() => setPrompt(tpl.prompt_template)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                    </div>
                    {tpl.is_vip_only && <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs shrink-0 ml-2">VIP</Badge>}
                  </div>
                  <div className="text-xs text-cyan-400 mt-2">{tpl.credits_cost} 算力</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
