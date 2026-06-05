'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sparkles, Wand2, Film, Mic, Zap, Crown, ArrowRight,
  ImageIcon, Video, FolderOpen, MoreHorizontal, Search,
} from 'lucide-react';

const features = [
  { title: 'AI生图', desc: '文字生成精美图片，多种风格随心选择', icon: Wand2, href: '/create/image', gradient: 'from-violet-500 to-purple-600', glow: 'bg-violet-500/20' },
  { title: 'AI视频', desc: '文字/图片生成视频，画质增强', icon: Film, href: '/create/video', gradient: 'from-cyan-500 to-blue-600', glow: 'bg-cyan-500/20' },
  { title: 'AI音乐', desc: '文字生成歌曲，多曲风切换', icon: Mic, href: '/create/music', gradient: 'from-rose-500 to-pink-600', glow: 'bg-rose-500/20' },
  { title: '提示词反解', desc: '上传图片反向拆解提示词，中英双语', icon: Search, href: '/create/prompt-analyzer', gradient: 'from-amber-500 to-orange-600', glow: 'bg-amber-500/20' },
];

interface ProjectItem {
  id: string;
  name: string;
  created_at: string;
  image_count: number;
  video_count: number;
  cover_url: string | null;
  default_cover: string | null;
}

export default function HomePage() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/projects', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);



  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-500/5 rounded-full blur-[150px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              AI驱动的多媒体创作平台
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                用AI释放创造力
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              一站式AI生图、视频生成、音乐制作，让你的想象变为现实
            </p>

            <div className="flex items-center justify-center gap-4 pt-4">
              {user ? (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium px-8"
                  onClick={() => router.push('/dashboard')}
                >
                  进入工作台 <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <>
                  <Link href="/login">
                    <Button size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium px-8">
                      登录 / 注册
                    </Button>
                  </Link>
                  <Link href="/dashboard">
                    <Button size="lg" variant="outline" className="px-8 border-border/50">
                      浏览功能
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {user && profile && (
              <div className="flex items-center justify-center gap-6 pt-4">
                <span className="flex items-center gap-2 text-sm"><Zap className="w-4 h-4 text-cyan-400" /> 算力点: <b className="text-cyan-400">{profile.credits}</b></span>
                <span className="flex items-center gap-2 text-sm"><Crown className="w-4 h-4 text-amber-400" /> 会员: <b className="text-amber-400">{profile.vip_level === 'free' ? '免费' : 'VIP'}</b></span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <Link key={f.href} href={user ? f.href : '/login'}>
              <Card className="group relative overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 cursor-pointer h-full">
                <div className={`absolute top-0 right-0 w-32 h-32 ${f.glow} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity`} />
                <CardContent className="p-6 relative">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 shadow-lg`}>
                    <f.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">{f.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{f.desc}</p>
                  <div className="flex items-center text-sm text-primary font-medium mt-4 group-hover:gap-2 transition-all">
                    开始创作 <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* 我的项目 - 登录后显示，第一个是新建按钮 */}
      {user && (
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold">我的项目</h2>
            <p className="text-muted-foreground mt-1">管理你的创作项目</p>
          </div>
          {projects.length > 8 && (
            <Button
              variant="ghost"
              className="text-cyan-400 hover:text-cyan-300"
              onClick={() => router.push('/projects')}
            >
              更多 <MoreHorizontal className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* 新建项目按钮 - 第一个位置 */}
          <Card
            className="group overflow-hidden border-dashed border-2 border-cyan-500/30 hover:border-cyan-500/60 bg-card/30 hover:bg-cyan-500/5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full"
            onClick={async () => {
              const name = `项目 ${new Date().toLocaleDateString('zh-CN')}`;
              try {
                const res = await fetch('/api/projects', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                  body: JSON.stringify({ name }),
                });
                if (res.ok) {
                  const data = await res.json();
                  router.push(`/projects/${data.project?.id}`);
                }
              } catch {
                // ignore
              }
            }}
          >
            <div className="h-24 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                <span className="text-2xl text-cyan-400 font-light">+</span>
              </div>
            </div>
            <CardContent className="p-3 text-center">
              <p className="font-medium text-sm text-cyan-400">新建项目</p>
              <p className="text-xs text-muted-foreground mt-1">创建新的创作项目</p>
            </CardContent>
          </Card>

          {/* 已保存的项目 */}
          {projects.slice(0, 7).map((p) => {
            const cover = p.cover_url || p.default_cover;
            return (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <Card className="group overflow-hidden border-border/50 hover:border-cyan-500/30 bg-card/50 hover:bg-card/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 cursor-pointer h-full">
                <div className="h-24 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 flex items-center justify-center relative overflow-hidden">
                  {cover ? (
                    <img src={cover} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <FolderOpen className="w-10 h-10 text-cyan-400/40 group-hover:text-cyan-400/70 transition-colors" />
                  )}
                  {(p.image_count > 0 || p.video_count > 0) && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      {p.image_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 flex items-center gap-0.5 backdrop-blur-sm">
                          <ImageIcon className="w-2.5 h-2.5" />{p.image_count}
                        </span>
                      )}
                      {p.video_count > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 flex items-center gap-0.5 backdrop-blur-sm">
                          <Video className="w-2.5 h-2.5" />{p.video_count}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <CardContent className="p-3">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(p.created_at).toLocaleDateString('zh-CN')}
                  </p>
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      </section>
      )}


    </div>
  );
}
