'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Bot, Download, Sparkles, Loader2, UserRound, MonitorSmartphone
} from 'lucide-react';

interface AIModel {
  id: string;
  name: string;
  endpoint_id: string;
  category: string;
  description: string;
}

interface Template {
  id: string;
  name: string;
  sub_category: string;
  description: string;
  prompt_template: string;
  credits_cost: number;
  is_vip_only: boolean;
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
  const [prompt, setPrompt] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('news_anchor');
  const [voices, setVoices] = useState<AIModel[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('zh_female_xiaohe_uranus_bigtts');
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=digital_human');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    }
  }, []);

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

  useEffect(() => { fetchTemplates(); fetchVoices(); }, [fetchTemplates, fetchVoices]);

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
        }),
      });
      const data = await res.json();
      const resultUrl = data.audio_url || data.video_url || data.url;
      if (resultUrl) {
        setResultUrl(resultUrl);
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
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            AI数字人
          </h1>
          <p className="text-muted-foreground mt-2">文字生成数字人播报视频，多形象多音色可选</p>
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

            {/* Result */}
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
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">数字人模板</h3>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer border-border/50 hover:border-amber-500/30 transition-all hover:-translate-y-0.5"
                onClick={() => { setPrompt(tpl.prompt_template); setSelectedAvatar(tpl.sub_category); }}
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
      </div>
    </div>
  );
}
