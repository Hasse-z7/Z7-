'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Download, Sparkles, Loader2,
  ChevronDown, FolderPlus,
  RefreshCw, Pencil, Check, Trash2, Clock, CheckCircle2, XCircle, X,
  Upload, ImagePlus, Plus
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
  platform?: string;
  is_free?: boolean;
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

import { usePersistedState } from '@/hooks/use-persisted-state';

export default function CreateImagePage() {
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt, clearPrompt] = usePersistedState<string>('image_prompt', '');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [resolution, setResolution, clearResolution] = usePersistedState<'1K' | '2K' | '4K'>('image_resolution', '2K');
  const [aspectRatio, setAspectRatio, clearAspectRatio] = usePersistedState<string>('image_aspect_ratio', '自适应');
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectedModelEndpoint, setSelectedModelEndpoint] = useState<string>('');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Multi-task queue
  const [tasks, setTasks] = useState<ImageTask[]>([]);
  const taskIdCounter = useRef(0);

  // 未保存到项目的作品追踪
  const [unsavedWorkIds, setUnsavedWorkIds] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [refImageUrls, setRefImageUrls, clearRefImages] = usePersistedState<string[]>('image_ref_images', []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imgFileInputRef = useRef<HTMLInputElement>(null);
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

  const handleSelectTemplate = (tpl: Template) => {
    setPrompt(tpl.prompt_template);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 20 * 1024 * 1024) continue;
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
          setRefImageUrls(prev => [...prev, data.url]);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploadingImage(false);
      if (imgFileInputRef.current) imgFileInputRef.current.value = '';
    }
  };

  const removeRefImage = (index: number) => {
    setRefImageUrls(prev => prev.filter((_, i) => i !== index));
  };

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
        const saved = localStorage.getItem('selectedProjectId');
        if (saved) setSelectedProjectId(saved);
      }
    } catch (err) {
      console.error('Fetch projects error:', err);
    }
  }, []);

  const fetchExistingWorks = useCallback(async () => {
    try {
      const res = await fetch('/api/works?type=image', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.works && data.works.length > 0) {
        const existingTasks: ImageTask[] = data.works.map((w: Record<string, string>) => ({
          id: w.id || crypto.randomUUID(),
          prompt: w.prompt || '',
          status: 'succeeded' as const,
          resultUrl: w.file_url || '',
          error: '',
          workId: w.id || '',
          editingPrompt: '',
          isEditing: false,
          createdAt: new Date(w.created_at || Date.now()).getTime(),
        }));
        setTasks(prev => {
          const existingIds = new Set(existingTasks.map(t => t.id));
          const memoryOnly = prev.filter(t => !existingIds.has(t.id));
          return [...memoryOnly, ...existingTasks];
        });
      }
    } catch (err) {
      console.error('Fetch existing works error:', err);
    }
  }, []);

  useEffect(() => { fetchTemplates(); fetchModels(); fetchProjects(); fetchExistingWorks(); }, [fetchTemplates, fetchModels, fetchProjects, fetchExistingWorks]);

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
          localStorage.setItem('selectedProjectId', data.project_id);
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

    // Clear persisted state for next input (only after generation starts)
    if (!overridePrompt) { setPrompt(''); clearPrompt(); }
    if (refImageUrls.length > 0) { clearRefImages(); }

    try {
      const res = await fetch('/api/ai/image', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt: activePrompt, size: `${calculatedWidth}*${calculatedHeight}`, model_endpoint: selectedModelEndpoint, project_id: selectedProjectId || undefined, image_urls: refImageUrls.length > 0 ? refImageUrls : undefined }),
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

        {/* 未创建项目时显示新建项目引导 */}
        {!selectedProjectId ? (
          <Card className="border-border/50 bg-card/50 backdrop-blur">
            <CardContent className="py-16 flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20 flex items-center justify-center mb-6">
                <Plus className="w-10 h-10 text-violet-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">新建项目</h2>
              <p className="text-muted-foreground mb-6 max-w-md">创建一个项目来开始AI创作，所有生成的作品将保存在项目中</p>
              <Button
                onClick={async () => {
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
                      // 同名项目已存在，从列表中找到并选中
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
                }}
                className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white px-8 py-3 text-base"
              >
                <Plus className="w-4 h-4 mr-2" />
                新建项目
              </Button>
            </CardContent>
          </Card>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Controls */}
          <div className="lg:col-span-2 space-y-6">
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
                {/* Reference Images */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-muted-foreground">参考图片（图生图）</label>
                    {refImageUrls.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => setRefImageUrls([])}>
                        清空全部
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {refImageUrls.map((url, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img src={url} alt={`参考图${idx + 1}`} className="w-full h-full object-cover" />
                        <button
                          className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setRefImageUrls(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {refImageUrls.length < 4 && (
                      <label className="w-16 h-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-colors">
                        <Plus className="w-5 h-5 text-muted-foreground/50" />
                        <span className="text-[10px] text-muted-foreground/50 mt-0.5">上传</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const formData = new FormData();
                            formData.append('file', file);
                            try {
                              const res = await fetch('/api/upload', { method: 'POST', body: formData, headers: getAuthHeaders() });
                              const data = await res.json();
                              if (data.url) setRefImageUrls(prev => [...prev, data.url]);
                            } catch { /* ignore */ }
                            e.target.value = '';
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

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
                  disabled={typeof prompt !== 'string' || !prompt.trim()}
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
                        <div className="mt-3 relative rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={() => setLightboxUrl(task.resultUrl!)}>
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
                        {m.name}{m.is_free ? ' [免费]' : ' [VIP]'}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </div>
                {selectedModelEndpoint && (() => {
                  const selectedModel = models.find(m => m.endpoint_id === selectedModelEndpoint);
                  return (
                    <div className="mt-1.5 flex items-center gap-2">
                      <p className="text-xs text-muted-foreground truncate">
                        {selectedModel?.description || selectedModelEndpoint}
                      </p>
                      {selectedModel?.is_free ? (
                        <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0">免费</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0">VIP</Badge>
                      )}
                    </div>
                  );
                })()}
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
        )}

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

        {/* 图片放大查看 */}
        {lightboxUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            >
              <X className="w-6 h-6" />
            </button>
            <img src={lightboxUrl} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
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
