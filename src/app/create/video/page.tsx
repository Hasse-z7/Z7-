'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, Loader2, Music, PlayCircle, PauseCircle, Trash2, ChevronDown, FolderPlus,
  RefreshCw, Pencil, Check, Clock, CheckCircle2, XCircle, Download, X
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

interface VideoTask {
  id: string;
  taskId: string; // server task_id for polling
  prompt: string;
  status: 'queued' | 'processing' | 'succeeded' | 'failed';
  statusText: string;
  resultUrl: string;
  error: string;
  editingPrompt: string;
  isEditing: boolean;
  createdAt: number;
}

const videoRatios = [
  ['Auto', '16:9', '4:3', '1:1', '3:4'],
  ['9:16', '21:9'],
];

export default function CreateVideoPage() {
  const { profile, user, updateCredits } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [videoRatio, setVideoRatio] = useState<string>('16:9');
  const [videoQuality, setVideoQuality] = useState<'480P' | '720P' | '1080P'>('720P');
  const [generateAudio, setGenerateAudio] = useState(true);

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

  // Multi-task queue
  const [tasks, setTasks] = useState<VideoTask[]>([]);
  const taskIdCounter = useRef(0);
  const pollingIntervals = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // 未保存到项目的视频任务追踪
  const [unsavedTaskIds, setUnsavedTaskIds] = useState<string[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
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

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      pollingIntervals.current.forEach(interval => clearInterval(interval));
    };
  }, []);

  // 离开页面保护：有未保存视频任务时提示
  const hasUnsavedWork = unsavedTaskIds.length > 0;

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

  // 保存视频任务到新建项目
  const handleSaveToProject = async () => {
    if (unsavedTaskIds.length === 0) return;
    setSaving(true);
    try {
      const now = new Date();
      const dateName = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}项目`;
      const res = await fetch('/api/works', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'save_to_project', task_ids: unsavedTaskIds, project_name: dateName }),
      });
      const data = await res.json();
      if (data.success) {
        setUnsavedTaskIds([]);
        fetchProjects();
        if (data.project_id) {
          setSelectedProjectId(data.project_id);
          localStorage.setItem('selected_project_id', data.project_id);
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
    setUnsavedTaskIds([]);
    setShowSaveDialog(false);
    if (pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // Audio upload handlers
  const handleAudioFile = (files: FileList | File[]) => {
    const file = Array.from(files).find(f => f.type === 'audio/mpeg' || f.name.toLowerCase().endsWith('.mp3'));
    if (!file) {
      alert('仅支持 MP3 格式音频文件');
      return;
    }
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

  // Start polling for a video task
  const startPolling = (localTaskId: string, serverTaskId: string) => {
    // Clear existing interval if any
    const existingInterval = pollingIntervals.current.get(localTaskId);
    if (existingInterval) clearInterval(existingInterval);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/ai/video/status?task_id=${serverTaskId}`, {
          credentials: 'include',
          headers: getAuthHeaders(),
        });
        const data = await res.json();

        // Update status text
        if (data.status_text) {
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, statusText: data.status_text } : t
          ));
        }

        // Update status
        if (data.status === 'processing' || data.status === 'queued') {
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, status: data.status } : t
          ));
        }

        // Success
        if (data.status === 'succeeded' && data.video_url) {
          clearInterval(interval);
          pollingIntervals.current.delete(localTaskId);
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, status: 'succeeded' as const, resultUrl: data.video_url, statusText: '生成完成' } : t
          ));
          return;
        }

        // Failed/timeout/refunded
        if (['failed', 'timeout', 'refunded'].includes(data.status)) {
          clearInterval(interval);
          pollingIntervals.current.delete(localTaskId);
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, status: 'failed' as const, error: data.error_message || '视频生成失败', statusText: '生成失败' } : t
          ));
          return;
        }
      } catch {
        // Polling error, continue
      }
    }, 3000);

    pollingIntervals.current.set(localTaskId, interval);

    // Max polling: 16 minutes
    setTimeout(() => {
      if (pollingIntervals.current.has(localTaskId)) {
        clearInterval(interval);
        pollingIntervals.current.delete(localTaskId);
      }
    }, 16 * 60 * 1000);
  };

  const handleGenerate = async (overridePrompt?: string) => {
    if (!user) { router.push('/login'); return; }
    const activePrompt = overridePrompt || prompt;
    if (!activePrompt.trim()) return;

    // 3算力点/秒 × 时长
    const cost = 3 * duration;
    if ((profile?.credits || 0) < cost) { router.push('/recharge'); return; }

    // Create local task entry
    const localTaskId = `vid_${Date.now()}_${++taskIdCounter.current}`;
    const newTask: VideoTask = {
      id: localTaskId,
      taskId: '',
      prompt: activePrompt,
      status: 'queued',
      statusText: '提交中...',
      resultUrl: '',
      error: '',
      editingPrompt: activePrompt,
      isEditing: false,
      createdAt: Date.now(),
    };
    setTasks(prev => [newTask, ...prev]);

    // Clear prompt for next input
    if (!overridePrompt) setPrompt('');

    try {
      const res = await fetch('/api/ai/video', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ prompt: activePrompt, duration, ratio: videoRatio, resolution: videoQuality, audio: generateAudio, model_id: selectedModelEndpoint, project_id: selectedProjectId || undefined }),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setTasks(prev => prev.map(t =>
          t.id === localTaskId ? { ...t, status: 'failed', error: data.error || '生成失败', statusText: '提交失败' } : t
        ));
        return;
      }

      // Update credits
      if (data.remaining_credits !== undefined) {
        updateCredits(data.remaining_credits);
      }

      const serverTaskId = data.task_id;

      // Track unsaved tasks
      if (!selectedProjectId && serverTaskId) {
        setUnsavedTaskIds(prev => [...prev, serverTaskId]);
      }

      if (serverTaskId) {
        // Async task: start polling
        setTasks(prev => prev.map(t =>
          t.id === localTaskId ? { ...t, taskId: serverTaskId, status: 'queued', statusText: '排队中...' } : t
        ));
        startPolling(localTaskId, serverTaskId);
      } else {
        // Sync fallback
        const videoUrl = data.video_url || data.videoUrl || data.url;
        if (videoUrl) {
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, status: 'succeeded', resultUrl: videoUrl, statusText: '生成完成' } : t
          ));
        } else {
          setTasks(prev => prev.map(t =>
            t.id === localTaskId ? { ...t, status: 'failed', error: '未获取到视频URL', statusText: '生成失败' } : t
          ));
        }
      }
    } catch {
      setTasks(prev => prev.map(t =>
        t.id === localTaskId ? { ...t, status: 'failed', error: '生成失败，请重试', statusText: '提交失败' } : t
      ));
    }
  };

  // Task actions
  const handleRemoveTask = (localTaskId: string) => {
    const interval = pollingIntervals.current.get(localTaskId);
    if (interval) {
      clearInterval(interval);
      pollingIntervals.current.delete(localTaskId);
    }
    setTasks(prev => prev.filter(t => t.id !== localTaskId));
  };

  const handleToggleEdit = (localTaskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === localTaskId ? { ...t, isEditing: !t.isEditing, editingPrompt: t.isEditing ? t.editingPrompt : t.prompt } : t
    ));
  };

  const handleSaveEdit = (localTaskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === localTaskId ? { ...t, prompt: t.editingPrompt, isEditing: false } : t
    ));
  };

  const handleEditPromptChange = (localTaskId: string, value: string) => {
    setTasks(prev => prev.map(t =>
      t.id === localTaskId ? { ...t, editingPrompt: value } : t
    ));
  };

  const handleRegenerate = (localTaskId: string) => {
    const task = tasks.find(t => t.id === localTaskId);
    if (!task) return;
    // Remove old task, generate with new prompt
    handleRemoveTask(localTaskId);
    handleGenerate(task.prompt);
  };

  const activeCount = tasks.filter(t => t.status === 'queued' || t.status === 'processing').length;

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

                {/* Audio Upload Module */}
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

                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    消耗 <span className="text-cyan-400 font-bold">{3 * duration}</span> 算力点（3点/秒×{duration}秒）
                  </div>
                  {activeCount > 0 && (
                    <div className="text-sm text-amber-400 flex items-center gap-1">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {activeCount}个任务进行中
                    </div>
                  )}
                </div>
                <Button
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium"
                  onClick={() => handleGenerate()}
                  disabled={!prompt.trim()}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  开始生成视频
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
                          {task.status === 'queued' || task.status === 'processing' ? (
                            <div className="w-24 h-24 rounded-lg bg-muted flex items-center justify-center">
                              <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                            </div>
                          ) : task.status === 'succeeded' && task.resultUrl ? (
                            <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted cursor-pointer" onClick={() => setLightboxUrl(task.resultUrl!)}>
                              <video src={task.resultUrl} className="w-full h-full object-cover" />
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
                            {(task.status === 'queued' || task.status === 'processing') && (
                              <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 bg-cyan-400/10">
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />{task.statusText || '处理中'}
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
                                <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white" onClick={() => handleSaveEdit(task.id)}>
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
                                  className="h-7 text-xs text-cyan-400 hover:text-cyan-300"
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
                                  className="h-7 text-xs text-cyan-400 hover:text-cyan-300"
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
                          <video src={task.resultUrl} controls className="w-full max-h-[500px]" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
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
                  <option value="">不选择项目</option>
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

        {/* 未保存作品提示栏 */}
        {hasUnsavedWork && !showSaveDialog && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-amber-500/90 backdrop-blur-sm text-white px-6 py-3 flex items-center justify-between">
            <span className="text-sm font-medium">您有 {unsavedTaskIds.length} 个视频任务未保存到项目</span>
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

        {/* 视频/图片放大查看 */}
        {lightboxUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
            <button
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
            >
              <X className="w-6 h-6" />
            </button>
            <video src={lightboxUrl} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" onClick={(e) => e.stopPropagation()} />
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
                  <p className="text-sm text-muted-foreground">您有视频任务未保存到项目</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                是否将 {unsavedTaskIds.length} 个视频任务保存到新建项目？点击"确定保存"将自动创建项目并关联作品，点击"取消"则不保存。
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
