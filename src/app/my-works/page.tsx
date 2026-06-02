'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ImageIcon, Video, Music, Trash2, Download, Eye, FolderOpen
} from 'lucide-react';

interface Work {
  id: string;
  title: string;
  work_type: string;
  file_url: string;
  thumbnail_url: string;
  prompt: string;
  created_at: string;
}

export default function MyWorksPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [filter, setFilter] = useState('all');

  const fetchWorks = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/works?type=${filter}`, {
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (data.works) setWorks(data.works);
    } catch (err) {
      console.error(err);
    }
  }, [user, filter]);

  useEffect(() => { fetchWorks(); }, [fetchWorks]);

  const handleDelete = async (id: string) => {
    if (!user || !confirm('确定删除此作品？')) return;
    try {
      await fetch(`/api/works?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { ...getAuthHeaders() },
      });
      setWorks(works.filter(w => w.id !== id));
    } catch {
      alert('删除失败');
    }
  };

  const typeIcons: Record<string, typeof ImageIcon> = {
    image: ImageIcon,
    video: Video,
    audio: Music,
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">我的作品</h1>
            <p className="text-muted-foreground mt-2">管理你的所有AI创作作品</p>
          </div>
        </div>

        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all"><FolderOpen className="w-4 h-4 mr-1" />全部</TabsTrigger>
            <TabsTrigger value="image"><ImageIcon className="w-4 h-4 mr-1" />图片</TabsTrigger>
            <TabsTrigger value="video"><Video className="w-4 h-4 mr-1" />视频</TabsTrigger>
            <TabsTrigger value="audio"><Music className="w-4 h-4 mr-1" />音乐</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
          {works.map((work) => {
            const Icon = typeIcons[work.work_type] || ImageIcon;
            return (
              <Card key={work.id} className="group border-border/50 hover:border-primary/30 transition-all overflow-hidden">
                <div className="relative h-40 bg-muted flex items-center justify-center">
                  {work.work_type === 'image' ? (
                    <img src={work.thumbnail_url} alt={work.title} className="w-full h-full object-cover" />
                  ) : (
                    <Icon className="w-12 h-12 text-muted-foreground/30" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => window.open(work.file_url, '_blank')}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => window.open(work.file_url, '_blank')}>
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(work.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="text-sm font-medium truncate">{work.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(work.created_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {works.length === 0 && (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground">暂无作品，快去创作吧</p>
          </div>
        )}
      </div>
    </div>
  );
}
