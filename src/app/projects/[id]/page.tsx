'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { ArrowLeft, FolderOpen, Image as ImageIcon, Video, Trash2, Download, MoreVertical, Pencil } from 'lucide-react';
import Link from 'next/link';

interface Project {
  id: string;
  name: string;
  cover_url: string | null;
  created_at: string;
}

interface Work {
  id: string;
  work_type: string;
  file_url: string;
  prompt: string;
  credits_cost: number;
  created_at: string;
  project_id: string;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [lightboxType, setLightboxType] = useState<'image' | 'video'>('image');
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedWorks, setSelectedWorks] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const p = data.projects?.find((proj: Project) => proj.id === projectId);
        if (p) setProject(p);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const fetchWorks = useCallback(async () => {
    try {
      const res = await fetch(`/api/works?project_id=${projectId}&mode=project`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setWorks(data.works || []);
      }
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchProject(), fetchWorks()]);
      setLoading(false);
    };
    if (projectId) load();
  }, [projectId, fetchProject, fetchWorks]);

  const handleRename = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`/api/projects?id=${projectId}&name=${encodeURIComponent(newName.trim())}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setProject(prev => prev ? { ...prev, name: newName.trim() } : null);
        setRenaming(false);
      }
    } catch { /* ignore */ }
  };

  const handleDeleteWorks = async () => {
    if (selectedWorks.size === 0) return;
    try {
      const res = await fetch('/api/works', {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_ids: Array.from(selectedWorks) }),
      });
      if (res.ok) {
        setSelectedWorks(new Set());
        setShowDeleteConfirm(false);
        fetchWorks();
      }
    } catch { /* ignore */ }
  };

  const toggleSelect = (workId: string) => {
    setSelectedWorks(prev => {
      const next = new Set(prev);
      if (next.has(workId)) next.delete(workId);
      else next.add(workId);
      return next;
    });
  };

  const imageCount = works.filter(w => w.work_type === 'image').length;
  const videoCount = works.filter(w => w.work_type === 'video').length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/projects')}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            {renaming ? (
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                  className="text-xl font-semibold bg-transparent border-b-2 border-sky-500 outline-none px-1 py-0.5"
                  autoFocus
                />
                <button onClick={handleRename} className="text-sm text-sky-500 hover:text-sky-400">保存</button>
                <button onClick={() => setRenaming(false)} className="text-sm text-muted-foreground hover:text-foreground">取消</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{project?.name || '项目详情'}</h1>
                <button
                  onClick={() => { setNewName(project?.name || ''); setRenaming(true); }}
                  className="p-1 rounded hover:bg-muted transition-colors"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><ImageIcon className="w-4 h-4" />{imageCount} 张图片</span>
              <span className="flex items-center gap-1"><Video className="w-4 h-4" />{videoCount} 个视频</span>
              <span>{works.length} 个作品</span>
            </div>
          </div>
          {selectedWorks.size > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors text-sm"
            >
              <Trash2 className="w-4 h-4" />
              删除 ({selectedWorks.size})
            </button>
          )}
        </div>

        {/* Works Grid */}
        {works.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FolderOpen className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg mb-2">项目内暂无作品</p>
            <p className="text-sm mb-4">前往AI生图或AI视频创作，作品会自动保存到此项目</p>
            <div className="flex gap-3">
              <Link href="/create/image" className="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm">
                AI生图
              </Link>
              <Link href="/create/video" className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm">
                AI视频
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {works.map(work => (
              <div
                key={work.id}
                className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer ${
                  selectedWorks.has(work.id)
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : 'border-border hover:border-sky-500/50'
                }`}
                onClick={() => {
                  if (selectedWorks.size > 0) {
                    toggleSelect(work.id);
                  } else {
                    if (work.work_type === 'video') {
                      setLightboxType('video');
                      setLightbox(work.file_url);
                    } else {
                      setLightboxType('image');
                      setLightbox(work.file_url);
                    }
                  }
                }}
                onContextMenu={e => { e.preventDefault(); toggleSelect(work.id); }}
              >
                {/* Thumbnail */}
                <div className="aspect-square bg-muted">
                  {work.work_type === 'video' ? (
                    <div className="w-full h-full flex items-center justify-center relative">
                      <video src={work.file_url} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                          <Video className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img src={work.file_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>

                {/* Info */}
                <div className="p-2 bg-card">
                  <p className="text-xs text-muted-foreground truncate">{work.prompt || '无提示词'}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    {work.credits_cost}算力 · {new Date(work.created_at).toLocaleDateString()}
                  </p>
                </div>

                {/* Select indicator */}
                {selectedWorks.has(work.id) && (
                  <div className="absolute top-2 left-2 w-6 h-6 bg-sky-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}

                {/* Hover actions */}
                {selectedWorks.size === 0 && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); toggleSelect(work.id); }}
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
          >
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {lightboxType === 'video' ? (
            <video
              src={lightbox}
              controls
              autoPlay
              className="max-w-[90vw] max-h-[90vh] rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <img
              src={lightbox}
              alt=""
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
              onClick={e => e.stopPropagation()}
            />
          )}
          <a
            href={lightbox}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="absolute bottom-6 right-6 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm flex items-center gap-2 transition-colors"
            onClick={e => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
            下载
          </a>
        </div>
      )}

      {/* Delete Confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-card rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl border border-border" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-muted-foreground text-sm mb-4">
              确定要删除选中的 {selectedWorks.size} 个作品吗？删除后将移入回收站。
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm">
                取消
              </button>
              <button onClick={handleDeleteWorks} className="px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors text-sm">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
