'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Video, Link, Copy, Check, Loader2, X, Play } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';

export default function VideoAnalyzerPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [inputMode, setInputMode] = useState<'upload' | 'url'>('upload');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      alert('请选择视频文件');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      alert('视频文件不能超过100MB');
      return;
    }
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setResult('');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('video/')) return;
    if (file.size > 100 * 1024 * 1024) return;
    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setResult('');
  }, []);

  const clearVideo = useCallback(() => {
    setVideoFile(null);
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setVideoPreview(null);
    setResult('');
  }, [videoPreview]);

  const uploadVideo = async (): Promise<string | null> => {
    if (!videoFile) return null;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('type', 'video');
      const token = localStorage.getItem('supabase_token') || '';
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-session': token },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      return data.url;
    } catch (err) {
      console.error('Upload error:', err);
      alert(err instanceof Error ? err.message : '视频上传失败');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    let url = '';
    if (inputMode === 'upload') {
      if (!videoFile) return;
      const uploadedUrl = await uploadVideo();
      if (!uploadedUrl) return;
      url = uploadedUrl;
    } else {
      if (!videoUrl.trim()) return;
      url = videoUrl.trim();
    }

    setAnalyzing(true);
    setResult('');

    try {
      const token = localStorage.getItem('supabase_token') || '';
      const res = await fetch('/api/ai/video-analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': token,
        },
        body: JSON.stringify({ videoUrl: url }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '解析失败');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                setResult(fullText);
              }
              if (parsed.error) {
                alert(parsed.error);
              }
            } catch {
              // skip
            }
          }
        }
      }
    } catch (err) {
      console.error('Analyze error:', err);
      alert(err instanceof Error ? err.message : '视频解析失败');
    } finally {
      setAnalyzing(false);
    }
  };

  const copySection = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(label);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch { /* ignore */ }
  };

  // Parse result into sections
  const parseResult = (text: string) => {
    const sections: { title: string; content: string }[] = [];
    const lines = text.split('\n');
    let currentTitle = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }
        currentTitle = line.replace('## ', '').trim();
        currentContent = [];
      } else if (line.startsWith('【') && line.endsWith('】')) {
        if (currentTitle) {
          sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
        }
        currentTitle = line;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    if (currentTitle) {
      sections.push({ title: currentTitle, content: currentContent.join('\n').trim() });
    }
    return sections;
  };

  const sections = result ? parseResult(result) : [];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6 text-cyan-500" />
            AI视频提示词反解
          </h1>
          <p className="text-muted-foreground mt-2">
            上传视频，自动逆向拆解生成适配Seedance/Midjourney的精准提示词
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Input */}
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                variant={inputMode === 'upload' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setInputMode('upload')}
                className={inputMode === 'upload' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}
              >
                <Upload className="w-4 h-4 mr-1" /> 上传视频
              </Button>
              <Button
                variant={inputMode === 'url' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setInputMode('url')}
                className={inputMode === 'url' ? 'bg-cyan-600 hover:bg-cyan-700' : ''}
              >
                <Link className="w-4 h-4 mr-1" /> 视频链接
              </Button>
            </div>

            {inputMode === 'upload' ? (
              <Card className="border-dashed border-2 border-muted-foreground/25 hover:border-cyan-500/50 transition-colors">
                <CardContent className="p-6">
                  {videoPreview ? (
                    <div className="space-y-3">
                      <div className="relative rounded-lg overflow-hidden bg-black">
                        <video
                          src={videoPreview}
                          controls
                          className="w-full max-h-64 object-contain"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={clearVideo}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {videoFile?.name}
                      </p>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center gap-3 py-8 cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                    >
                      <div className="w-14 h-14 rounded-full bg-cyan-500/10 flex items-center justify-center">
                        <Upload className="w-6 h-6 text-cyan-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium">点击或拖拽上传视频</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          支持 MP4/MOV/WebM，最大 100MB
                        </p>
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-cyan-500 shrink-0" />
                    <Textarea
                      placeholder="粘贴视频链接（支持公开可访问的视频URL）"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      className="min-h-[80px] resize-none"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analyze button */}
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium"
              onClick={handleAnalyze}
              disabled={
                analyzing ||
                uploading ||
                (inputMode === 'upload' ? !videoFile : !videoUrl.trim())
              }
            >
              {analyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  正在解析视频...
                </>
              ) : uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  上传视频中...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4 mr-2" />
                  开始解析
                </>
              )}
            </Button>

            {/* Tips */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <h4 className="text-sm font-medium mb-2">解析说明</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• 自动拆解分镜：时间轴、景别、运镜、光影、人物、场景</li>
                  <li>• 输出两套提示词：精简关键词 + 结构化Seedance Prompt</li>
                  <li>• 结构化格式：画面风格 → 分镜时序 → 摄影机运动 → 光影配色 → 环境细节 → 配乐音效</li>
                  <li>• 支持所有常见视频格式，建议时长不超过60秒效果最佳</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Right: Result */}
          <div className="space-y-4">
            {analyzing && !result ? (
              <Card>
                <CardContent className="p-8 flex flex-col items-center gap-4">
                  <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
                  <p className="text-sm text-muted-foreground">正在分析视频内容，请稍候...</p>
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-cyan-500 animate-bounce"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : sections.length > 0 ? (
              sections.map((section, idx) => (
                <Card key={idx} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-cyan-500">
                        {section.title}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copySection(section.content, `${idx}`)}
                      >
                        {copiedSection === `${idx}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">
                      {section.content}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 flex flex-col items-center gap-3">
                  <Video className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    上传视频后点击"开始解析"，结果将在此显示
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
