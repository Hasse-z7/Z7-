'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Clock, Trash2, Image, Video, Loader2, CheckSquare, Square } from 'lucide-react';
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
  created_at: string;
  project_id: string;
  project_name: string;
}

export default function HistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [works, setWorks] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');

  const fetchWorks = useCallback(async () => {
    try {
      const res = await fetch('/api/works?include_project=true', { headers: getAuthHeaders() });
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
    fetchWorks();
  }, [user, router, fetchWorks]);

  const filteredWorks = works.filter((w) => filter === 'all' || w.work_type === filter);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredWorks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredWorks.map((w) => w.id)));
    }
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/works', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (res.ok) {
        setDeleteOpen(false);
        setSelected(new Set());
        fetchWorks();
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
          <Clock className="h-8 w-8 text-sky-500" />
          <h1 className="text-2xl font-bold">历史记录</h1>
          <span className="text-muted-foreground text-sm">({works.length})</span>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> 删除选中 ({selected.size})
            </Button>
          )}
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex gap-2 mb-6">
        {(['all', 'image', 'video'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => { setFilter(f); setSelected(new Set()); }}
          >
            {f === 'all' ? '全部' : f === 'image' ? '图片' : '视频'}
          </Button>
        ))}
        {filteredWorks.length > 0 && (
          <Button variant="ghost" size="sm" onClick={toggleAll} className="ml-auto">
            {selected.size === filteredWorks.length ? (
              <CheckSquare className="h-4 w-4 mr-1" />
            ) : (
              <Square className="h-4 w-4 mr-1" />
            )}
            {selected.size === filteredWorks.length ? '取消全选' : '全选'}
          </Button>
        )}
      </div>

      {filteredWorks.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Clock className="h-16 w-16 mx-auto mb-4 opacity-30" />
          <p>暂无历史记录</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {filteredWorks.map((work) => (
            <Card
              key={work.id}
              className={`group cursor-pointer transition-all duration-300 ${
                selected.has(work.id) ? 'ring-2 ring-sky-500' : 'hover:shadow-lg hover:-translate-y-0.5'
              }`}
              onClick={() => toggleSelect(work.id)}
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
                    <div className="absolute top-1 right-1 bg-sky-500 rounded-full p-0.5">
                      <CheckSquare className="h-3 w-3 text-white" />
                    </div>
                  )}
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 删除确认对话框 */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selected.size} 个作品吗？删除后将移入回收站，可随时恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
