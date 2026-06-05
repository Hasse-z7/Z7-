'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import {
  FolderOpen, Plus, Pencil, Trash2, Image, Video, Loader2,
  FolderInput, ImageIcon, MoreVertical, ExternalLink,
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
  const [coverOpen, setCoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewName('');
        fetchProjects();
      } else {
        const data = await res.json();
        alert(data.error || '创建失败');
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

  const handleCoverUpdate = async () => {
    if (!selectedProject) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects?id=${selectedProject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ cover_url: coverUrl.trim() || null }),
      });
      if (res.ok) {
        setCoverOpen(false);
        setCoverUrl('');
        setSelectedProject(null);
        fetchProjects();
      } else {
        const data = await res.json();
        alert(data.error || '修改封面失败');
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

  const openCoverChange = (project: Project) => {
    setSelectedProject(project);
    setCoverUrl(project.cover_url || '');
    setCoverOpen(true);
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
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-8 w-8 text-sky-500" />
          <h1 className="text-2xl font-bold">项目管理</h1>
        </div>
        <Button onClick={() => { setNewName(''); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> 新建项目
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FolderOpen className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p>暂无项目，生成图片或视频时将自动创建</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setContextMenu({ x: rect.left, y: rect.bottom, project });
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
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
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            onClick={() => { openCoverChange(contextMenu.project); setContextMenu(null); }}
          >
            <ImageIcon className="h-4 w-4" /> 修改封面
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

      {/* 创建项目对话框 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>输入项目名称，创建后可在生图/生视频时选择</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="项目名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              创建
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

      {/* 修改封面对话框 */}
      <Dialog open={coverOpen} onOpenChange={setCoverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改项目封面</DialogTitle>
            <DialogDescription>输入图片URL作为项目封面，留空则使用项目内第一张作品作为封面</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="图片URL（留空使用默认封面）"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
          />
          {coverUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border aspect-[4/3] bg-muted/30">
              <img src={coverUrl} alt="封面预览" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoverOpen(false)}>取消</Button>
            <Button onClick={handleCoverUpdate} disabled={submitting}>
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
