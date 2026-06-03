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
  Wand2, ImageIcon, Upload, Download, Sparkles, Loader2,
  Palette, Maximize2, Filter, X, Plus, ChevronDown, FolderPlus,
  RefreshCw, Pencil, Check, Trash2, Clock, CheckCircle2, XCircle
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

interface ImageTask {
  id: string;
  prompt: string;
  status: 'generating' | 'succeeded' | 'failed';
  resultUrl: string;
  error: string;
  workId: string;
  editingPrompt: string;
  isEditing: boolean;
  createdAt: number;
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
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<'text2img' | 'img2img' | 'hd_fix' | 'outpaint'>('text2img');
  const [selectedStyle, setSelectedStyle] = useState('realistic');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [resolution, setResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [aspectRatio, setAspectRatio] = useState<string>('自适应');
  const [refImages, setRefImages] = useState<{ file: File; preview: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_REF_IMAGES = 12;
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModelEndpoint, setSelectedModelEndpoint] = useState<string>('');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Multi-task queue
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const taskIdCounter = useRef(0);

  // 未保存到项目的作品追踪
  const [unsavedWorkIds, setUnsavedWorkIds] = useState<string[]>([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/templates?category=image');
      const data = await res.json();
      if (data.templates) setTemplates(data.templates);
    } catch (err) {
      console.error('Fetch templates error:', err);
    }
  }, []);

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models?category=image');
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        const saved = localStorage.getItem('selected_image_model');
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
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        const saved = localStorage.getItem('selectedProjectId_image');
        if (saved) setSelectedProjectId(saved);
      }
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); fetchModels(); fetchProjects(); }, [fetchTemplates, fetchModels, fetchProjects]);

  // 离开页面保护：有未保存作品时提示
  const hasUnsavedWork = unsavedWorkIds.length > 0;

  useEffect(() => {
    if (!hasUnsavedWork) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePopState = () => {
      setShowSaveDialog(true);
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [hasUnsavedWork]);

  // 保存作品到新建项目
  const handleSaveToProject = async () => {
    if (unsavedWorkIds.length === 0) return;
    setSaving(true);
    try {
      const now = new Date();
      const dateName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}项目`;
      const res = await fetch('/api/works', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'save_to_project', work_ids: unsavedWorkIds, project_name: dateName }),
      });
      const data = await res.json();
      if (data.success) {
        setUnsavedWorkIds([]);
        fetchProjects();
        if (data.project_id) {
          setSelectedProjectId(data.project_id);
          localStorage.setItem('selectedProjectId_image', data.project_id);
        }
        setShowSaveDialog(false);
        if (pendingNavigation) {
          router.push(pendingNavigation);
          setPendingNavigation(null);
        }
      } else {
        alert(data.error || '保存失败');
      }
    } catch {
      alert('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 不保存，直接离开
  const handleSkipSave = () => {
    setUnsavedWorkIds([]);
    setShowSaveDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  const handleGenerate = async (overridePrompt?: string) => {
    if (!user) { router.push('/login'); return; }
    const activePrompt = overridePrompt || prompt;
    if (!activePrompt.trim()) return;

    // Calculate dimensions from resolution + aspect ratio
    const { base } = resolutionMap[resolution];
    const [rw, rh] = aspectRatioMap[aspectRatio] || [1, 1];
    const maxDim = base;
    const calculatedWidth = rw >= rh ? maxDim : Math.round(maxDim * (rw / rh));
    const calculatedHeight = rh >= rw ? maxDim : Math.round(maxDim * (rh / rw));

    // Check credits: 2算力点/张
    const cost = 2;
    if ((profile?.credits || 0) < cost) {
      router.push('/recharge');
      return;
    }

    // Create task entry
    const taskId = `img_${Date.now()}_${++taskIdCounter.current}`;
    const newTask: ImageTask = {
      id: taskId,
      prompt: activePrompt,
      status: 'generating',
      resultUrl: '',
      error: '',
      workId: '',
      editingPrompt: activePrompt,
      isEditing: false,
      createdAt: Date.now(),
    };
    setTasks(prev => [newTask, ...prev]);

    // Clear prompt for next input
    if (!overridePrompt) setPrompt('');

    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt: activePrompt, size: `${calculatedWidth}*${calculatedHeight}`, model_endpoint: selectedModelEndpoint, project_id: selectedProjectId || undefined }),
      });
      const data = await res.json();
      const imageUrl = data.image_urls?.[0] || data.image_url;
      if (imageUrl) {
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'succeeded' as const, resultUrl: imageUrl, workId: data.work_id || '', editingPrompt: activePrompt }
            : t
        ));
        if (data.remaining_credits !== undefined) {
          updateCredits(data.remaining_credits);
        }
        // 如果没有选择项目，记录为未保存作品
        if (!selectedProjectId && data.work_id) {
          setUnsavedWorkIds(prev => [...prev, data.work_id]);
        }
      } else {
        setTasks(prev => prev.map(t =>
          t.id === taskId
            ? { ...t, status: 'failed' as const, error: data.error || '生成失败' }
            : t
        ));
      }
    } catch {
      setTasks(prev => prev.map(t =>
        t.id === taskId
          ? { ...t, status: 'failed' as const, error: '生成失败，请重试' }
          : t
      ));
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

  // Task actions
  const handleRemoveTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const handleToggleEdit = (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, isEditing: !t.isEditing, editingPrompt: t.isEditing ? t.editingPrompt : t.prompt } : t
    ));
  };

  const handleSaveEdit = (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, prompt: t.editingPrompt, isEditing: false } : t
    ));
  };

  const handleEditPromptChange = (taskId: string, value: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, editingPrompt: value } : t
    ));
  };

  const handleRegenerate = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    // Remove old task, generate with new prompt
    setTasks(prev => prev.filter(t => t.id !== taskId));
    handleGenerate(task.prompt);
  };

  const generatingCount = tasks.filter(t => t.status === 'generating').length;

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
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    消耗 <span className="text-cyan-400 font-bold">2</span> 算力点/张
                  </div>
                  {generatingCount > 0 && (
                    <div className="text-sm text-amber-400 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {generatingCount}个任务进行中
                    </div>
                  )}
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-medium"
                  onClick={() => handleGenerate()}
                  disabled={!prompt.trim()}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  开始生成
                </Button>
              </CardContent>
            </Card>

            {/* Task Queue */}
            {tasks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">任务列表</h2>
                  <span className="text-xs text-muted-foreground">{tasks.length}个任务</span>
                </div>
                {tasks.map((task) => (
                  <Card key={task.id} className="border-border/50 overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        {/* Status indicator + preview */}
                        <div className="shrink-0">
                          {task.status === 'generating' ? (
                            <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
                            </div>
                          ) : task.status === 'succeeded' && task.resultUrl ? (
                            <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted">
                              <img src={task.resultUrl} alt="Result" className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded-lg bg-red-500/10 flex items-center justify-center">
                              <XCircle className="w-8 h-8 text-red-400" />
                            </div>
                          )}
                        </div>

                        {/* Task info */}
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Status badge */}
                          <div className="flex items-center gap-2">
                            {task.status === 'generating' && (
                              <Badge variant="outline" className="text-violet-400 border-violet-400/30 bg-violet-400/10">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />生成中
                              </Badge>
                            )}
                            {task.status === 'succeeded' && (
                              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                                <CheckCircle2 className="w-3 h-3 mr-1" />已完成
                              </Badge>
                            )}
                            {task.status === 'failed' && (
                              <Badge variant="outline" className="text-red-400 border-red-400/30 bg-red-400/10">
                                <XCircle className="w-3 h-3 mr-1" />失败
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(task.createdAt).toLocaleTimeString()}
                            </span>
                          </div>

                          {/* Prompt - editable */}
                          {task.isEditing ? (
                            <div className="space-y-2">
                              <Textarea
                                value={task.editingPrompt}
                                onChange={(e) => handleEditPromptChange(task.id, e.target.value)}
                                rows={2}
                                className="resize-none text-sm"
                              />
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => handleToggleEdit(task.id)}>
                                  取消
                                </Button>
                                <Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-white" onClick={() => handleSaveEdit(task.id)}>
                                  <Check className="w-3.5 h-3.5 mr-1" />保存
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground line-clamp-2">{task.prompt}</p>
                          )}

                          {/* Error message */}
                          {task.status === 'failed' && task.error && (
                            <p className="text-xs text-red-400">{task.error}</p>
                          )}

                          {/* Action buttons */}
                          <div className="flex items-center gap-2 pt-1">
                            {task.status === 'succeeded' && !task.isEditing && (
                              <>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleToggleEdit(task.id)}
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1" />修改提示词
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-xs text-violet-400 hover:text-violet-300"
                                  onClick={() => handleRegenerate(task.id)}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 mr-1" />重新生成
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-xs text-sky-400 hover:text-sky-300"
                                  onClick={() => window.open(task.resultUrl, '_blank')}
                                >
                                  <Download className="w-3.5 h-3.5 mr-1" />下载
                                </Button>
                              </>
                            )}
                            {task.status === 'failed' && !task.isEditing && (
                              <>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleToggleEdit(task.id)}
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1" />修改提示词
                                </Button>
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-7 text-xs text-violet-400 hover:text-violet-300"
                                  onClick={() => handleRegenerate(task.id)}
                                >
                                  <RefreshCw className="w-3.5 h-3.5 mr-1" />重新生成
                                </Button>
                              </>
                            )}
                            <div className="flex-1" />
                            <Button
                              size="sm" variant="ghost"
                              className="h-7 text-xs text-muted-foreground hover:text-red-400"
                              onClick={() => handleRemoveTask(task.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Full-size result for succeeded tasks */}
                      {task.status === 'succeeded' && task.resultUrl && (
                        <div className="mt-3 relative rounded-lg overflow-hidden bg-muted">
                          <img src={task.resultUrl} alt="Generated" className="w-full object-contain max-h-[500px]" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Right: Parameters & Templates */}
          <div className="space-y-4">
            {/* Project Selection */}
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">项目</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => {
                      setSelectedProjectId(e.target.value);
                      localStorage.setItem('selected_project_id', e.target.value);
                    }}
                    className="w-full appearance-none rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5 pr-10 text-sm text-foreground transition-colors hover:bg-muted focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">不选择项目</option>
                    {projects.map((p: { id: string; name: string }) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
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
                      localStorage.setItem('selected_image_model', e.target.value);
                    }}
                    className="w-full appearance-none rounded-lg border border-border/50 bg-muted/50 px-3 py-2.5 pr-10 text-sm text-foreground transition-colors hover:bg-muted focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
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
                  <div className="text-xs text-cyan-400 mt-2">{tpl.credits_cost} 算力点</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* 未保存作品提示栏 */}
        {hasUnsavedWork && !showSaveDialog && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-amber-500/90 backdrop-blur-sm text-white px-6 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">您有 {unsavedWorkIds.length} 件作品未保存到项目</span>
            <div className="flex gap-3">
              <Button size="sm" variant="ghost" className="text-white/80 hover:text-white hover:bg-white/10" onClick={handleSkipSave}>
                不保存
              </Button>
              <Button size="sm" className="bg-white text-amber-600 hover:bg-white/90 font-medium" onClick={handleSaveToProject} disabled={saving}>
                <FolderPlus className="w-4 h-4 mr-1" />
                {saving ? '保存中...' : '保存并新建项目'}
              </Button>
            </div>
          </div>
        )}

        {/* 保存确认弹窗 */}
        {showSaveDialog && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card border border-border/50 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <FolderPlus className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">保存到项目</h3>
                  <p className="text-sm text-muted-foreground">您有作品未保存到项目</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                是否将 {unsavedWorkIds.length} 件作品保存到新建项目？点击"确定保存"将自动创建项目并关联作品，点击"取消"则不保存。
              </p>
              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={handleSkipSave} disabled={saving}>
                  取消
                </Button>
                <Button className="bg-sky-500 hover:bg-sky-600 text-white" onClick={handleSaveToProject} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderPlus className="w-4 h-4 mr-1" />}
                  确定保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
