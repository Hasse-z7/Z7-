'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Trash2, RotateCcw, Video, Loader2, CheckSquare, Square, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';

interface WorkItem {
  id: string;
  work_type: string;
  file_url: string;
  prompt: string;
  credits_cost: number;
  deleted_at: string;
  project_id: string;
  project_name: string;
}

export default function TrashPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWork, setPreviewWork] = useState<WorkItem | null>(null);

  const fetchTrash = useCallback(async () => {
    try {
      const res = await fetch('/api/works?deleted=true&include_project=true', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorks(data.works || []);
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
    fetchTrash();
  }, [user, router, fetchTrash]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === works.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(works.map((w) => w.id)));
    }
  };

  const handleRestore = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/works', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'restore', ids: Array.from(selected) }),
      });
      if (res.ok) {
        setRestoreOpen(false);
        setSelected(new Set());
        fetchTrash();
      } else {
        const data = await res.json();
        alert(data.error || '恢复失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/works', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ action: 'permanent_delete', ids: Array.from(selected) }),
      });
      if (res.ok) {
        setPermanentDeleteOpen(false);
        setSelected(new Set());
        fetchTrash();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Trash2 className="h-8 w-8 text-amber-500" />
          <h1 className="text-2xl font-bold">回收站</h1>
          <span className="text-muted-foreground text-sm">({works.length})</span>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => setRestoreOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-1" /> 恢复选中 ({selected.size})
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setPermanentDeleteOpen(true)}>
                <XCircle className="h-4 w-4 mr-1" /> 永久删除 ({selected.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {works.length > 0 && (
        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selected.size === works.length ? (
              <CheckSquare className="h-4 w-4 mr-1" />
            ) : (
              <Square className="h-4 w-4 mr-1" />
            )}
            {selected.size === works.length ? '取消全选' : '全选'}
          </Button>
        </div>
      )}

      {works.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Trash2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p>回收站为空</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {works.map((work) => (
            <Card
              key={work.id}
              className={`group cursor-pointer transition-all duration-300 ${
                selected.has(work.id) ? 'ring-2 ring-amber-500' : 'hover:shadow-lg hover:-translate-y-0.5'
              }`}
              onClick={() => { toggleSelect(work.id); }}
            >
              <CardContent className="p-2">
                <div className="relative aspect-square rounded-md overflow-hidden bg-muted">
                  {work.work_type === 'video' ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <video
                        src={work.file_url}
                        className="w-full h-full object-cover"
                        muted
                      />
                      <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1.5 py-0.5">
                        <Video className="h-3 w-3 text-white" />
                      </div>
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={work.file_url}
                      alt={work.prompt}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {selected.has(work.id) && (
                    <div className="absolute top-1 right-1 bg-amber-500 rounded-full p-0.5">
                      <CheckSquare className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {/* 预览按钮 */}
                  <div
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"
                    onClick={(e) => { e.stopPropagation(); setPreviewWork(work); setPreviewOpen(true); }}
                  >
                    <span className="opacity-0 group-hover:opacity-100 text-white text-xs bg-black/50 px-2 py-1 rounded transition-opacity">
                      预览
                    </span>
                  </div>
                </div>
                <div className="mt-2 px-1">
                  <p className="text-xs text-muted-foreground truncate">
                    {work.work_type === 'video' ? '视频' : '图片'} · {work.credits_cost}算力
                  </p>
                  {work.project_name && (
                    <p className="text-xs text-muted-foreground truncate">
                      {work.project_name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    删除于 {new Date(work.deleted_at).toLocaleDateString('zh-CN')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 预览对话框 */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>预览</DialogTitle>
          </DialogHeader>
          {previewWork && (
            <div className="flex justify-center">
              {previewWork.work_type === 'video' ? (
                <video
                  src={previewWork.file_url}
                  controls
                  className="max-h-[60vh] rounded-md"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewWork.file_url}
                  alt={previewWork.prompt}
                  className="max-h-[60vh] rounded-md"
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 恢复确认对话框 */}
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认恢复</DialogTitle>
            <DialogDescription>
              确定要恢复选中的 {selected.size} 个作品吗？恢复后将回到原项目与历史记录。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreOpen(false)}>取消</Button>
            <Button onClick={handleRestore} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              <RotateCcw className="h-4 w-4 mr-1" /> 确定恢复
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 永久删除确认对话框 */}
      <Dialog open={permanentDeleteOpen} onOpenChange={setPermanentDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除</DialogTitle>
            <DialogDescription>
              确定要永久删除选中的 {selected.size} 个作品吗？此操作不可恢复！
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermanentDeleteOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handlePermanentDelete} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              <XCircle className="h-4 w-4 mr-1" /> 永久删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
