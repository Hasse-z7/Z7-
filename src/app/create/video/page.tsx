'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Film, Play, Upload, Download, Sparkles, Loader2, Video, Clapperboard, ZoomIn,
  X, Plus, Music, PlayCircle, PauseCircle, Trash2, ChevronDown
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

interface AIModel {
  id: string;
  name: string;
  endpoint_id: string;
  category: string;
  description: string;
}

const videoStyles = [
  { id: 'short_film', name: '短视频口播', icon: '🎬', desc: '口播短视频' },
  { id: 'film_scene', name: '影视短片', icon: '🎥', desc: '电影级场景' },
  { id: 'landscape', name: '风景大片', icon: '🌄', desc: '自然风光' },
];

const videoRatios = [
  ['Auto', '16:9', '4:3', '1:1', '3:4'],
  ['9:16', '21:9'],
];

export default function CreateVideoPage() {
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'text2video' | 'img2video' | 'extend' | 'enhance'>('text2video');
  const [duration, setDuration] = useState(5);
  const [loading, setLoading] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<string>(''); // 排队中/渲染中
  const [resultUrl, setResultUrl] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [videoRatio, setVideoRatio] = useState<string>('16:9');
  const [videoQuality, setVideoQuality] = useState<'480P' | '720P' | '1080P'>('720P');
  const [generateAudio, setGenerateAudio] = useState(true);

  // Multi-image upload
  const [refImages, setRefImages] = useState<{ file: File; preview: string }[]>([]);
  const [imgDragOver, setImgDragOver] = useState(false);
  const imgFileInputRef = useRef<HTMLInputElement>(null);
  const MAX_REF_IMAGES = 12;

  // Audio upload (MP3 only)
  const [audioFile, setAudioFile] = useState<{ file: File; preview: string } | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioDragOver, setAudioDragOver] = useState(false);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Model selection
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModelEndpoint, setSelectedModelEndpoint] = useState<string>('');

  // Project selection
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=video');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models?category=video');
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        // 恢复上次选择的模型
        const saved = localStorage.getItem('selected_video_model');
        if (saved && data.models.some((m: AIModel) => m.endpoint_id === saved)) {
          setSelectedModelEndpoint(saved);
        } else if (data.models.length > 0) {
          setSelectedModelEndpoint(data.models[0].endpoint_id);
        }
      }
    } catch (err) {
      console.error('Fetch models error:', err);
    }
  }, []);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
        const saved = localStorage.getItem('selected_project_id');
        if (saved && data.projects.some((p: { id: string }) => p.id === saved)) {
          setSelectedProjectId(saved);
        }
      }
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); fetchModels(); fetchProjects(); }, [fetchTemplates, fetchModels, fetchProjects]);

  // Multi-image upload handlers
  const addRefImages = (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const remaining = MAX_REF_IMAGES - refImages.length;
    if (remaining <= 0) {
      alert(`最多上传 ${MAX_REF_IMAGES} 张素材图`);
      return;
    }
    const toAdd = fileArr.slice(0, remaining);
    if (fileArr.length > remaining) {
      alert(`已超出数量限制，仅添加前 ${remaining} 张`);
    }
    const newItems = toAdd.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setRefImages(prev => [...prev, ...newItems]);
  };

  const removeRefImage = (index: number) => {
    setRefImages(prev => {
      const item = prev[index];
      URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleImgDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgDragOver(true);
  };

  const handleImgDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgDragOver(false);
  };

  const handleImgDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgDragOver(false);
    if (e.dataTransfer.files.length > 0) addRefImages(e.dataTransfer.files);
  };

  // Audio upload handlers
  const handleAudioFile = (files: FileList | File[]) => {
    const file = Array.from(files).find(f => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3'));
    if (!file) {
      alert('仅支持 MP3 格式音频文件');
      return;
    }
    // Clean up previous
    if (audioFile) {
      URL.revokeObjectURL(audioFile.preview);
      setAudioPlaying(false);
    }
    setAudioFile({ file, preview: URL.createObjectURL(file) });
  };

  const removeAudio = () => {
    if (audioFile) {
      URL.revokeObjectURL(audioFile.preview);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setAudioPlaying(false);
      setAudioFile(null);
    }
  };

  const toggleAudioPlay = () => {
    if (!audioFile) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(audioFile.preview);
      audioRef.current.onended = () => setAudioPlaying(false);
    }
    if (audioPlaying) {
      audioRef.current.pause();
      setAudioPlaying(false);
    } else {
      audioRef.current.play();
      setAudioPlaying(true);
    }
  };

  const handleAudioDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAudioDragOver(true);
  };

  const handleAudioDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAudioDragOver(false);
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAudioDragOver(false);
    if (e.dataTransfer.files.length > 0) handleAudioFile(e.dataTransfer.files);
  };

  const handleGenerate = async () => {
    if (!user) { router.push('/login'); return; }
    // 3算力点/秒 × 时长
    const cost = 3 * duration;
    if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

    setLoading(true);
    setResultUrl('');
    setPollingStatus('提交中...');
    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt, duration, ratio: videoRatio, resolution: videoQuality, audio: generateAudio, model_id: selectedModelEndpoint, project_id: selectedProjectId || undefined }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        alert(data.error || '生成失败');
        return;
      }

      // 更新算力余额
      if (data.remaining_credits !== undefined) {
        updateCredits(data.remaining_credits);
      }

      // 异步任务模式：轮询状态
      const taskId = data.task_id;
      if (!taskId) {
        // 兼容旧版同步返回
        const videoUrl = data.video_url || data.videoUrl || data.url;
        if (videoUrl) setResultUrl(videoUrl);
        return;
      }

      setPollingStatus('排队中...');
      const videoUrl = await pollTaskStatus(taskId);
      if (videoUrl) {
        setResultUrl(videoUrl);
      }
    } catch {
      alert('生成失败，请重试');
    } finally {
      setLoading(false);
      setPollingStatus('');
    }
  };

  /** 轮询任务状态，返回视频URL或空字符串 */
  const pollTaskStatus = (taskId: string): Promise<string> => {
    return new Promise((resolve) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/ai/video/status?task_id=${taskId}`, {
            credentials: 'include',
            headers: getAuthHeaders(),
          });
          const data = await res.json();

          if (data.status_text) {
            setPollingStatus(data.status_text);
          }

          // 成功
          if (data.status === 'succeeded' && data.video_url) {
            clearInterval(interval);
            resolve(data.video_url);
            return;
          }

          // 失败/超时/已退算力
          if (['failed', 'timeout', 'refunded'].includes(data.status)) {
            clearInterval(interval);
            alert(data.error_message || '视频生成失败');
            resolve('');
            return;
          }
        } catch {
          // 轮询异常，继续尝试
        }
      }, 3000); // 每3秒轮询

      // 最多轮询16分钟（略大于后端15分钟超时）
      setTimeout(() => {
        clearInterval(interval);
        resolve('');
      }, 16 * 60 * 1000);
    });
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

                {/* Image Upload for img2video / extend / enhance modes */}
                {(mode === 'img2video' || mode === 'extend' || mode === 'enhance') && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">上传素材图</span>
                      <span className="text-xs text-muted-foreground">{refImages.length}/{MAX_REF_IMAGES}</span>
                    </div>
                    {/* Drag & Drop Zone */}
                    <div
                      className={`border-2 border-dashed rounded-xl p-5 text-center transition-all cursor-pointer ${
                        imgDragOver
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-border/50 hover:border-cyan-500/40 hover:bg-muted/30'
                      }`}
                      onDragOver={handleImgDragOver}
                      onDragLeave={handleImgDragLeave}
                      onDrop={handleImgDrop}
                      onClick={() => imgFileInputRef.current?.click()}
                    >
                      <Plus className="w-6 h-6 mx-auto text-muted-foreground mb-1.5" />
                      <p className="text-sm text-muted-foreground">
                        点击选择或拖拽图片到此处
                      </p>
                      <p className="text-xs text-muted-foreground/60 mt-1">
                        支持 JPG/PNG/WebP，单次最多 {MAX_REF_IMAGES} 张
                      </p>
                      <input
                        ref={imgFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files) addRefImages(e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </div>
                    {/* Thumbnail Grid */}
                    {refImages.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                        {refImages.map((img, idx) => (
                          <div
                            key={idx}
                            className="relative group aspect-square rounded-lg overflow-hidden border border-border/50"
                          >
                            <img
                              src={img.preview}
                              alt={`素材图 ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                              onClick={(e) => { e.stopPropagation(); removeRefImage(idx); }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                            <div className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white px-1 rounded">
                              {idx + 1}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Audio Upload Module */}
                {(mode === 'img2video' || mode === 'text2video') && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Music className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-medium">音频上传</span>
                      <span className="text-xs text-muted-foreground">（可选）</span>
                    </div>
                    {audioFile ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                        <button
                          onClick={toggleAudioPlay}
                          className="shrink-0 w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/30 transition-colors"
                        >
                          {audioPlaying ? <PauseCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{audioFile.file.name}</p>
                          <p className="text-xs text-muted-foreground">MP3 音频</p>
                        </div>
                        <button
                          onClick={removeAudio}
                          className="shrink-0 w-7 h-7 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
                          audioDragOver
                            ? 'border-cyan-500 bg-cyan-500/10'
                            : 'border-border/50 hover:border-cyan-500/40 hover:bg-muted/30'
                        }`}
                        onDragOver={handleAudioDragOver}
                        onDragLeave={handleAudioDragLeave}
                        onDrop={handleAudioDrop}
                        onClick={() => audioFileInputRef.current?.click()}
                      >
                        <Music className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
                        <p className="text-sm text-muted-foreground">
                          点击选择或拖拽 MP3 音频文件
                        </p>
                        <p className="text-xs text-muted-foreground/60 mt-1">
                          无音频时视频默认静音或使用自带背景音
                        </p>
                        <input
                          ref={audioFileInputRef}
                          type="file"
                          accept=".mp3,audio/mpeg"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files) handleAudioFile(e.target.files);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end">
                  <div className="text-sm text-muted-foreground">
                    消耗 <span className="text-cyan-400 font-bold">{3 * duration}</span> 算力点（3点/秒×{duration}秒）
                  </div>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {loading ? (pollingStatus || '生成中...') : '开始生成视频'}
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
            {/* Project Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">项目选择</CardTitle>
              </CardHeader>
              <CardContent>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-muted focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                >
                  <option value="">自动创建新项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </CardContent>
            </Card>

            {/* Model Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">模型选择</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <select
                    value={selectedModelEndpoint}
                    onChange={(e) => {
                      setSelectedModelEndpoint(e.target.value);
                      localStorage.setItem('selected_video_model', e.target.value);
                    }}
                    className="w-full appearance-none rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5 pr-10 text-sm text-foreground transition-colors hover:bg-muted focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    {models.length === 0 && (
                      <option value="">暂无可用模型</option>
                    )}
                    {models.map((m) => (
                      <option key={m.endpoint_id} value={m.endpoint_id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {selectedModelEndpoint && (
                  <p className="mt-1.5 text-xs text-muted-foreground truncate">
                    {selectedModelEndpoint}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Video Ratio Panel */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">比例</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {videoRatios.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex gap-2">
                    {row.map((ratio) => (
                      <button
                        key={ratio}
                        className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                          videoRatio === ratio
                            ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/25'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        onClick={() => setVideoRatio(ratio)}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Video Quality Panel */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">清晰度</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {(['480P', '720P', '1080P'] as const).map((q) => (
                    <button
                      key={q}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        videoQuality === q
                          ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/25'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      onClick={() => setVideoQuality(q)}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Duration Slider */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">视频时长</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <input
                    type="range"
                    min={3}
                    max={15}
                    step={1}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-muted accent-cyan-500"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>3秒</span>
                    <span className="text-cyan-400 font-bold text-sm">{duration}秒</span>
                    <span>15秒</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Audio Toggle */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">生成音频</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">为视频添加背景音频</span>
                  <button
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      generateAudio ? 'bg-cyan-500' : 'bg-muted'
                    }`}
                    onClick={() => setGenerateAudio(!generateAudio)}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        generateAudio ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </CardContent>
            </Card>

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
                  <div className="text-xs text-cyan-400 mt-2">{tpl.credits_cost} 算力点</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
