'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import {
  FolderOpen, Plus, Pencil, Trash2, Image, Video, Loader2,
  FolderInput, ImageIcon, MoreVertical, ExternalLink, Music, Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

interface Project {
  id: string;
  name: string;
  is_default: boolean;
  cover_url: string | null;
  default_cover: string | null;
  created_at: string;
  image_count: number;
  video_count: number;
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    project: Project;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    fetchProjects();
  }, [user, router, fetchProjects]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // 生成默认项目名
  const getDefaultProjectName = () => {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `${dateStr}项目`;
  };

  const handleCreate = async () => {
    const nameToUse = newName.trim() || getDefaultProjectName();
    setSubmitting(true);
    setNameError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: nameToUse }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewName('');
        fetchProjects();
      } else {
        const data = await res.json();
        if (res.status === 409) {
          setNameError('项目名称已存在，请使用其他名称');
        } else {
          setNameError(data.error || '创建失败');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!selectedProject || !newName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects?id=${selectedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setRenameOpen(false);
        setNewName('');
        setSelectedProject(null);
        fetchProjects();
      } else {
        const data = await res.json();
        alert(data.error || '重命名失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProject) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects?id=${selectedProject.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setDeleteOpen(false);
        setSelectedProject(null);
        fetchProjects();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openProject = (project: Project) => {
    router.push(`/projects/${project.id}`);
  };

  const openRename = (project: Project) => {
    setSelectedProject(project);
    setNewName(project.name);
    setRenameOpen(true);
  };

  const openDelete = (project: Project) => {
    setSelectedProject(project);
    setDeleteOpen(true);
  };

  const handleContextMenu = (e: React.MouseEvent, project: Project) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, project });
  };

  const getCoverImage = (project: Project) => {
    return project.cover_url || project.default_cover || null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">我的项目</h1>
        <p className="text-muted-foreground mt-1">管理你的创作项目</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {/* 新建项目 - 始终在第一个位置 */}
        <Card
          className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 overflow-hidden border-dashed border-2 border-cyan-500/30 hover:border-cyan-500/60 bg-card/30 hover:bg-cyan-500/5"
          onClick={() => { setNewName(getDefaultProjectName()); setNameError(''); setCreateOpen(true); }}
        >
          <div className="aspect-[4/3] flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <Plus className="w-7 h-7 text-cyan-400" />
              </div>
              <span className="text-cyan-400 font-medium text-sm">新建项目</span>
              <span className="text-muted-foreground text-xs">创建新的创作项目</span>
            </div>
          </div>
        </Card>

        {/* 已有项目列表 */}
        {projects.map((project) => {
          const cover = getCoverImage(project);
          return (
            <Card
              key={project.id}
              className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 overflow-hidden"
              onClick={() => openProject(project)}
              onContextMenu={(e) => handleContextMenu(e, project)}
            >
              {/* 封面区域 */}
              <div className="aspect-[4/3] relative bg-muted/30 overflow-hidden">
                {cover ? (
                  <img
                    src={cover}
                    alt={project.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FolderInput className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}
                {/* 悬浮遮罩 */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 flex items-center justify-center">
                  <ExternalLink className="h-8 w-8 text-white opacity-0 group-hover:opacity-80 transition-opacity duration-300" />
                </div>
                {/* 右上角更多按钮 */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7 bg-black/40 hover:bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    openProject(project);
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
                {/* 作品计数 */}
                {(project.image_count > 0 || project.video_count > 0) && (
                  <div className="absolute bottom-1 left-1 flex gap-1">
                    {project.image_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/50 text-white flex items-center gap-0.5 backdrop-blur-sm">
                        <ImageIcon className="w-2.5 h-2.5" />{project.image_count}
                      </span>
                    )}
                    {project.video_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/50 text-white flex items-center gap-0.5 backdrop-blur-sm">
                        <Video className="w-2.5 h-2.5" />{project.video_count}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* 信息区域 */}
              <CardContent className="p-3">
                <h3 className="font-semibold text-sm truncate">{project.name}</h3>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1.5">
                  <span className="flex items-center gap-0.5">
                    <Image className="h-3 w-3" />{project.image_count}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Video className="h-3 w-3" />{project.video_count}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 空状态提示 - 没有项目时显示 */}
      {projects.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>点击上方卡片创建你的第一个项目</p>
        </div>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { openProject(contextMenu.project); setContextMenu(null); }}
          >
            <ExternalLink className="h-4 w-4" /> 打开
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { openRename(contextMenu.project); setContextMenu(null); }}
          >
            <Pencil className="h-4 w-4" /> 重命名
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => { openDelete(contextMenu.project); setContextMenu(null); }}
          >
            <Trash2 className="h-4 w-4" /> 删除项目
          </button>
        </div>
      )}

      {/* 创建项目对话框 - 保存/取消按钮 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>输入项目名称，或使用默认名称直接保存</DialogDescription>
          </DialogHeader>
          <Input
            placeholder={getDefaultProjectName()}
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNameError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          {nameError && <p className="text-sm text-destructive">{nameError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setNewName(''); setNameError(''); }}>取消</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重命名对话框 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名项目</DialogTitle>
            <DialogDescription>修改项目名称</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="新名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>取消</Button>
            <Button onClick={handleRename} disabled={!newName.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              {selectedProject && (selectedProject.image_count > 0 || selectedProject.video_count > 0)
                ? '该项目包含内容，无法删除。请先删除项目内的所有作品。'
                : `确定要删除项目"${selectedProject?.name}"吗？`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button>
            {selectedProject && selectedProject.image_count === 0 && selectedProject.video_count === 0 && (
              <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                删除
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
