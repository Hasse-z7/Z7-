'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useActionThrottle } from '@/hooks/use-action-throttle';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import {
  Upload,
  ImageIcon,
  Loader2,
  Copy,
  Check,
  Sparkles,
  Wand2,
  Trash2,
} from 'lucide-react';

const STYLE_OPTIONS = [
  { label: '真人写实', value: '真人写实' },
  { label: '仙侠古风', value: '仙侠古风' },
  { label: '3D渲染', value: '3D渲染' },
  { label: '暗黑哥特', value: '暗黑哥特' },
  { label: '赛博朋克', value: '赛博朋克' },
  { label: '水彩插绘', value: '水彩插绘' },
  { label: '日系动漫', value: '日系动漫' },
  { label: '油画质感', value: '油画质感' },
];

interface PromptResult {
  chinese: string;
  english: string;
  negative: string;
}

export default function PromptAnalyzerPage() {
  const { user } = useAuth();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState('真人写实');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PromptResult | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('图片大小不能超过20MB');
      return;
    }

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'image');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (data.url) {
        setImageUrl(data.url);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  }, [getAuthHeaders]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const dt = new DataTransfer();
      dt.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }, []);

  // 限流：3秒冷却 + 请求中锁定
  const analyzeThrottle = useActionThrottle(
    async () => {
      if (!imageUrl || !user) return;
      setResult(null);
      setStreamingText('');

      try {
        const res = await fetch('/api/ai/prompt-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ imageUrl, style: selectedStyle }),
        });

        if (res.status === 429) { alert('请求频繁，请稍后重试'); return; }
        if (!res.ok) { const err = await res.json(); alert(err.error || '解析失败'); return; }

        const reader = res.body?.getReader();
        if (!reader) return;

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
                if (parsed.content) { fullText += parsed.content; setStreamingText(fullText); }
                if (parsed.error) { alert(parsed.error); }
              } catch { /* skip */ }
            }
          }
        }
        const parsed = parsePromptResult(fullText);
        setResult(parsed);
      } catch (err) {
        console.error('Analyze failed:', err);
        alert('解析失败，请重试');
      }
    },
    { cooldown: 3000 },
  );

  const parsePromptResult = (text: string): PromptResult => {
    const chineseMatch = text.match(/【中文正向提示词】\s*([\s\S]*?)(?=【英文生成提示词】|$)/);
    const englishMatch = text.match(/【英文生成提示词】\s*([\s\S]*?)(?=【反向负面提示词】|$)/);
    const negativeMatch = text.match(/【反向负面提示词】\s*([\s\S]*?)$/);

    return {
      chinese: chineseMatch?.[1]?.trim() || '',
      english: englishMatch?.[1]?.trim() || '',
      negative: negativeMatch?.[1]?.trim() || '',
    };
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleReset = () => {
    setImageUrl(null);
    setImagePreview(null);
    setResult(null);
    setStreamingText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0f172a] to-[#0a0e1a] text-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/20 border border-cyan-500/30">
              <Wand2 className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-sky-400 bg-clip-text text-transparent">
                AI提示词反解
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                上传图片，自动反向拆解生成三套提示词
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Upload & Settings */}
          <div className="space-y-4">
            {/* Image Upload */}
            <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-cyan-400" />
                  上传图片
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!imagePreview ? (
                  <div
                    className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-300"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">点击或拖拽上传图片</p>
                    <p className="text-slate-500 text-xs mt-1">支持 JPG/PNG/WebP，最大 20MB</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                ) : (
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="预览"
                      className="w-full rounded-xl object-contain max-h-80 bg-black/30"
                    />
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={handleReset}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {uploading && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Style Selection */}
            <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  画风选择
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map((s) => (
                    <Badge
                      key={s.value}
                      variant={selectedStyle === s.value ? 'default' : 'outline'}
                      className={`cursor-pointer transition-all duration-200 ${
                        selectedStyle === s.value
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 hover:bg-cyan-500/30'
                          : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                      }`}
                      onClick={() => setSelectedStyle(s.value)}
                    >
                      {s.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Analyze Button */}
            <Button
              className="w-full h-12 text-base bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-600 hover:to-sky-600 text-white font-medium rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/25"
              disabled={!imageUrl || analyzeThrottle.disabled || uploading}
              onClick={() => analyzeThrottle.run()}
            >
              {analyzeThrottle.loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  正在解析...
                </>
              ) : analyzeThrottle.cooling ? (
                `${analyzeThrottle.cooldownRemaining}秒后可再次解析`
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  开始解析提示词
                </>
              )}
            </Button>
          </div>

          {/* Right: Results */}
          <div className="space-y-4">
            {analyzeThrottle.loading && !result && streamingText && (
              <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
                    <span className="text-sm text-cyan-400">正在生成提示词...</span>
                  </div>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                    {streamingText}
                  </div>
                </CardContent>
              </Card>
            )}

            {result && (
              <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    解析结果
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="chinese" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 bg-slate-800/50">
                      <TabsTrigger value="chinese" className="text-xs">中文正向</TabsTrigger>
                      <TabsTrigger value="english" className="text-xs">英文生成</TabsTrigger>
                      <TabsTrigger value="negative" className="text-xs">反向负面</TabsTrigger>
                    </TabsList>

                    <TabsContent value="chinese" className="mt-4">
                      <div className="relative">
                        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed min-h-[200px] max-h-[400px] overflow-y-auto">
                          {result.chinese || '暂无内容'}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-slate-700"
                          onClick={() => handleCopy(result.chinese, 'chinese')}
                        >
                          {copiedField === 'chinese' ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="english" className="mt-4">
                      <div className="relative">
                        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed min-h-[200px] max-h-[400px] overflow-y-auto">
                          {result.english || '暂无内容'}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-slate-700"
                          onClick={() => handleCopy(result.english, 'english')}
                        >
                          {copiedField === 'english' ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="negative" className="mt-4">
                      <div className="relative">
                        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed min-h-[200px] max-h-[400px] overflow-y-auto">
                          {result.negative || '暂无内容'}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-slate-700"
                          onClick={() => handleCopy(result.negative, 'negative')}
                        >
                          {copiedField === 'negative' ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-slate-400" />
                          )}
                        </Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}

            {!analyzeThrottle.loading && !result && !streamingText && (
              <Card className="bg-slate-900/60 border-slate-700/50 backdrop-blur-sm">
                <CardContent className="pt-6 pb-8 text-center">
                  <div className="p-4 rounded-2xl bg-slate-800/30 w-fit mx-auto mb-4">
                    <Wand2 className="w-10 h-10 text-slate-600" />
                  </div>
                  <h3 className="text-slate-400 font-medium mb-2">等待解析</h3>
                  <p className="text-slate-500 text-sm max-w-xs mx-auto">
                    上传图片并选择画风后，点击"开始解析提示词"即可生成三套提示词
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Badge variant="outline" className="text-slate-500 border-slate-700">中文正向</Badge>
                    <Badge variant="outline" className="text-slate-500 border-slate-700">英文生成</Badge>
                    <Badge variant="outline" className="text-slate-500 border-slate-700">反向负面</Badge>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
