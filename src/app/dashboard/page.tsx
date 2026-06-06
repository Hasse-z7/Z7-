'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sparkles, Zap, Crown, Shield,
  ArrowRight, Wand2, Film, Mic, FolderOpen, History, Trash2, Plus, Folder,
  User, Phone, Mail, Calendar, Coins, CreditCard, Gift
} from 'lucide-react';

const features = [
  {
    title: 'AI生图',
    desc: '文生图、图生图、高清修复、风格滤镜',
    icon: Wand2,
    href: '/create/image',
    gradient: 'from-violet-500 to-purple-600',
    bgGlow: 'bg-violet-500/20',
  },
  {
    title: 'AI视频',
    desc: '文生视频、图生视频、视频延长、画质增强',
    icon: Film,
    href: '/create/video',
    gradient: 'from-cyan-500 to-blue-600',
    bgGlow: 'bg-cyan-500/20',
  },
  {
    title: 'AI音乐',
    desc: '文字生成歌曲、AI伴奏、人声分离',
    icon: Mic,
    href: '/create/music',
    gradient: 'from-rose-500 to-pink-600',
    bgGlow: 'bg-rose-500/20',
  },
];

interface Project {
  id: string;
  name: string;
  created_at: string;
  image_count: number;
  video_count: number;
  cover_url: string | null;
  default_cover: string | null;
}

export default function DashboardPage() {
  const { user, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);

  const fetchProjects = useCallback(async () => {
    try {
      const token = localStorage.getItem('sb-access-token');
      if (!token) return;
      const res = await fetch('/api/projects', {
        headers: { 'x-session': token },
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async () => {
    try {
      const token = localStorage.getItem('sb-access-token');
      if (!token) return;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session': token },
        body: JSON.stringify({ name: `${today}项目`, auto_default: true }),
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = `/projects/${data.project?.id}`;
      }
    } catch {
      // ignore
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '未知';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const totalCredits = (profile?.free_credits || 0) + (profile?.paid_credits || 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* User Account Info Card */}
        {profile && (
          <Card className="relative overflow-hidden border-cyan-500/20 bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 backdrop-blur-sm">
            <div className="absolute inset-0">
              <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/8 rounded-full blur-3xl" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/8 rounded-full blur-3xl" />
            </div>
            <CardContent className="relative p-6 sm:p-8">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Left: Avatar + Basic Info */}
                <div className="flex items-start gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-cyan-500/20 flex-shrink-0">
                    {(profile.nickname || profile.phone || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-bold">{profile.nickname || '用户'}</h2>
                      {profile.is_admin && (
                        <Link href="/admin" className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors">
                          <Shield className="w-3 h-3" />
                          管理员
                        </Link>
                      )}
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                        <Crown className="w-3 h-3" />
                        {profile.vip_level === 'free' ? '免费用户' : `VIP ${profile.vip_level}`}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {profile.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{profile.phone}</span>
                        </div>
                      )}
                      {user?.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5" />
                          <span>{user.email}</span>
                        </div>
                      )}
                      {profile.created_at && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>注册于 {formatDate(profile.created_at)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Credits Breakdown */}
                <div className="flex-1 lg:ml-auto">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Total Credits */}
                    <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/15 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs text-muted-foreground font-medium">总算力</span>
                      </div>
                      <div className="text-2xl font-bold text-cyan-400">{totalCredits}</div>
                      <div className="text-xs text-muted-foreground mt-1">算力点</div>
                    </div>
                    {/* Free Credits */}
                    <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs text-muted-foreground font-medium">免费算力</span>
                      </div>
                      <div className="text-2xl font-bold text-emerald-400">{profile.free_credits || 0}</div>
                      <div className="text-xs text-muted-foreground mt-1">优先消耗</div>
                    </div>
                    {/* Paid Credits */}
                    <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CreditCard className="w-4 h-4 text-violet-400" />
                        <span className="text-xs text-muted-foreground font-medium">付费算力</span>
                      </div>
                      <div className="text-2xl font-bold text-violet-400">{profile.paid_credits || 0}</div>
                      <div className="text-xs text-muted-foreground mt-1">永久有效</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Not logged in */}
        {!profile && (
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-8 text-center">
              <User className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">请先登录查看个人信息</p>
              <Link href="/login">
                <Button className="mt-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white">登录</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Core Features */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold">AI创作</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => (
              <Link key={feature.href} href={feature.href}>
                <Card className="group relative overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1 cursor-pointer h-full">
                  <div className={`absolute top-0 right-0 w-32 h-32 ${feature.bgGlow} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <CardHeader className="relative">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-3 shadow-lg`}>
                      <feature.icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-lg">{feature.title}</CardTitle>
                    <CardDescription className="text-sm">{feature.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center text-sm text-primary font-medium group-hover:gap-2 transition-all">
                      开始创作 <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* My Projects */}
        {profile && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold">我的项目</h2>
              </div>
              {projects.length > 7 && (
                <Link href="/projects">
                  <Button variant="ghost" size="sm" className="text-cyan-400 hover:text-cyan-300">
                    更多 <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* New Project Button */}
              <button
                onClick={handleCreateProject}
                className="group flex flex-col items-center justify-center h-36 rounded-xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-full bg-cyan-500/10 group-hover:bg-cyan-500/20 flex items-center justify-center mb-2 transition-colors">
                  <Plus className="w-6 h-6 text-cyan-400" />
                </div>
                <span className="text-sm font-medium text-cyan-400">新建项目</span>
              </button>

              {/* Project Cards */}
              {projects.slice(0, 7).map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="group overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 cursor-pointer h-36">
                    {project.cover_url || project.default_cover ? (
                      <div className="h-full relative">
                        <img src={project.cover_url || project.default_cover || ''} alt={project.name} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <p className="font-medium text-sm truncate text-white">{project.name}</p>
                          <div className="flex items-center gap-3 text-xs text-white/70">
                            {project.image_count > 0 && <span>{project.image_count} 图片</span>}
                            {project.video_count > 0 && <span>{project.video_count} 视频</span>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <CardContent className="p-4 h-full flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Folder className="w-4 h-4 text-cyan-400" />
                            <p className="font-medium text-sm truncate">{project.name}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(project.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {project.image_count > 0 && <span>{project.image_count} 图片</span>}
                          {project.video_count > 0 && <span>{project.video_count} 视频</span>}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Quick Links */}
        <section>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/recharge">
              <Card className="group hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors">
                    <Zap className="w-5 h-5 text-cyan-500" />
                  </div>
                  <div>
                    <p className="font-medium">算力充值</p>
                    <p className="text-sm text-muted-foreground">查看余额与流水</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/my-works">
              <Card className="group hover:border-violet-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-violet-500/10 group-hover:bg-violet-500/20 transition-colors">
                    <History className="w-5 h-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="font-medium">我的作品</p>
                    <p className="text-sm text-muted-foreground">查看所有创作</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/membership">
              <Card className="group hover:border-amber-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                    <Crown className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-medium">会员权益</p>
                    <p className="text-sm text-muted-foreground">升级VIP享更多</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
