'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { FolderOpen, Plus, Pencil, Trash2, Image, Video, Loader2 } from 'lucide-react';
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

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
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

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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

  const openRename = (project: Project) => {
    setSelectedProject(project);
    setNewName(project.name);
    setRenameOpen(true);
  };

  const openDelete = (project: Project) => {
    setSelectedProject(project);
    setDeleteOpen(true);
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Card key={project.id} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base truncate">{project.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(project.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openRename(project)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => openDelete(project)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Image className="h-4 w-4" /> {project.image_count} 张图片
                  </span>
                  <span className="flex items-center gap-1">
                    <Video className="h-4 w-4" /> {project.video_count} 个视频
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
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
