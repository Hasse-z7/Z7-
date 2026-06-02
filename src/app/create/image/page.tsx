'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Wand2, ImageIcon, Upload, Download, Sparkles, Loader2,
  Palette, Maximize2, Filter, X, Plus
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

const styleCards = [
  { id: 'realistic', name: '超写实', icon: '🎨', desc: '逼真写实风格' },
  { id: 'anime', name: '二次元', icon: '🌸', desc: '日系动漫风格' },
  { id: 'guofeng', name: '国风水墨', icon: '🏔️', desc: '传统水墨风格' },
  { id: 'cyberpunk', name: '赛博朋克', icon: '🌃', desc: '未来科技风' },
  { id: 'oil_painting', name: '油画大师', icon: '🖼️', desc: '经典油画风格' },
  { id: '3d_cartoon', name: '3D卡通', icon: '🧸', desc: '3D渲染卡通' },
];

const resolutionMap: Record<string, { base: number }> = {
  '1K': { base: 512 },
  '2K': { base: 1024 },
  '4K': { base: 2048 },
};

const aspectRatioMap: Record<string, [number, number]> = {
  '自适应': [1, 1],
  '1:1': [1, 1],
  '9:16': [9, 16],
  '16:9': [16, 9],
  '3:4': [3, 4],
  '4:3': [4, 3],
  '3:2': [3, 2],
  '2:3': [2, 3],
  '4:5': [4, 5],
  '5:4': [5, 4],
  '21:9': [21, 9],
};

const imageRatios = [
  ['自适应', '1:1', '9:16', '16:9', '3:4'],
  ['4:3', '3:2', '2:3', '4:5', '5:4'],
  ['21:9'],
];

export default function CreateImagePage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'text2img' | 'img2img' | 'hd_fix' | 'outpaint'>('text2img');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [aspectRatio, setAspectRatio] = useState<string>('自适应');
  const [refImages, setRefImages] = useState<{ file: File; preview: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_REF_IMAGES = 12;

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=image');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleGenerate = async () => {
    if (!user) { router.push('/login'); return; }
    if (!prompt.trim()) return;

    // Calculate dimensions from resolution + aspect ratio
    const { base } = resolutionMap[resolution];
    const [rw, rh] = aspectRatioMap[aspectRatio] || [1, 1];
    const maxDim = base;
    const calculatedWidth = rw >= rh ? maxDim : Math.round(maxDim * (rw / rh));
    const calculatedHeight = rh >= rw ? maxDim : Math.round(maxDim * (rh / rw));
    setWidth(calculatedWidth);
    setHeight(calculatedHeight);

    // Check credits
    const cost = mode === 'hd_fix' ? 8 : 5;
    if ((profile?.credits || 0) < cost) {
      router.push('/recharge');
      return;
    }

    setLoading(true);
    setResultUrl('');
    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, width: calculatedWidth, height: calculatedHeight }),
      });
      const data = await res.json();
      if (data.image_url) {
        setResultUrl(data.image_url);
        // Save to works
        await fetch('/api/works', { credentials: 'include',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: prompt.slice(0, 50),
            work_type: 'image',
            file_url: data.image_url,
            thumbnail_url: data.image_url,
            prompt,
            metadata: { mode, style: selectedStyle, width, height },
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

  const addRefImages = (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    const remaining = MAX_REF_IMAGES - refImages.length;
    if (remaining <= 0) {
      alert(`最多上传 ${MAX_REF_IMAGES} 张参考图`);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      addRefImages(e.dataTransfer.files);
    }
  };

  const handleSelectTemplate = (tpl: Template) => {
    setPrompt(tpl.prompt_template);
    setSelectedStyle(tpl.sub_category);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">
            AI生图
          </h1>
          <p className="text-muted-foreground mt-2">文字描述生成精美图片，支持多种风格和创作模式</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mode Tabs */}
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text2img"><Wand2 className="w-4 h-4 mr-1" />文生图</TabsTrigger>
                <TabsTrigger value="img2img"><ImageIcon className="w-4 h-4 mr-1" />图生图</TabsTrigger>
                <TabsTrigger value="hd_fix"><Maximize2 className="w-4 h-4 mr-1" />高清修复</TabsTrigger>
                <TabsTrigger value="outpaint"><Palette className="w-4 h-4 mr-1" />扩图</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Style Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">选择风格</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {styleCards.map((style) => (
                    <div
                      key={style.id}
                      className={`p-3 rounded-lg border cursor-pointer text-center transition-all hover:-translate-y-0.5 ${
                        selectedStyle === style.id
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-border/50 hover:border-violet-500/30'
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

            {/* Image Upload for img2img / hd_fix / outpaint modes */}
            {(mode === 'img2img' || mode === 'hd_fix' || mode === 'outpaint') && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    上传参考图
                    <span className="text-xs font-normal text-muted-foreground ml-auto">
                      {refImages.length}/{MAX_REF_IMAGES}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {mode === 'img2img' ? '上传参考图片，AI将基于参考图风格生成新图' :
                     mode === 'hd_fix' ? '上传需要高清修复的图片' :
                     '上传需要扩图的原图'}
                    ，最多 {MAX_REF_IMAGES} 张，支持拖拽批量上传
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Drag & Drop Zone */}
                  <div
                    className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                      dragOver
                        ? 'border-violet-500 bg-violet-500/10'
                        : 'border-border/50 hover:border-violet-500/40 hover:bg-muted/30'
                    }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      点击选择或拖拽图片到此处
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      支持 JPG/PNG/WebP，单次最多 {MAX_REF_IMAGES} 张
                    </p>
                    <input
                      ref={fileInputRef}
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
                            alt={`参考图 ${idx + 1}`}
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
                </CardContent>
              </Card>
            )}

            {/* Prompt Input */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">描述你想要的图片</CardTitle>
                <CardDescription>详细描述可以获得更好的效果</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="例如：一位身穿白色长裙的少女站在樱花树下，花瓣随风飘落，阳光透过树叶洒下斑驳光影..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <div className="flex items-center justify-end">
                  <div className="text-sm text-muted-foreground">
                    消耗 <span className="text-cyan-400 font-bold">{mode === 'hd_fix' ? 8 : 5}</span> 算力
                  </div>
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={loading || !prompt.trim()}
                >
                  {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {loading ? '生成中...' : '开始生成'}
                </Button>
              </CardContent>
            </Card>

            {/* Result */}
            {resultUrl && (
              <Card className="border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">生成结果</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative rounded-lg overflow-hidden bg-muted">
                    <img src={resultUrl} alt="Generated" className="w-full object-contain max-h-[600px]" />
                  </div>
                  <div className="flex gap-3 mt-4">
                    <Button variant="outline" className="flex-1" onClick={() => window.open(resultUrl, '_blank')}>
                      <Download className="w-4 h-4 mr-2" /> 下载图片
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: Parameters & Templates */}
          <div className="space-y-4">
            {/* Resolution Panel */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">分辨率</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {(['1K', '2K', '4K'] as const).map((res) => (
                    <button
                      key={res}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                        resolution === res
                          ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      onClick={() => setResolution(res)}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Aspect Ratio Panel */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">画面比例</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {imageRatios.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex gap-2">
                    {row.map((ratio) => (
                      <button
                        key={ratio}
                        className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-all ${
                          aspectRatio === ratio
                            ? 'bg-violet-500 text-white shadow-md shadow-violet-500/25'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                        onClick={() => setAspectRatio(ratio)}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>

            <h3 className="text-lg font-semibold">推荐模板</h3>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer border-border/50 hover:border-violet-500/30 transition-all hover:-translate-y-0.5"
                onClick={() => handleSelectTemplate(tpl)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description}</p>
                    </div>
                    {tpl.is_vip_only && (
                      <Badge variant="outline" className="text-amber-400 border-amber-400/30 text-xs shrink-0 ml-2">VIP</Badge>
                    )}
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
