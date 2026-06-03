'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sparkles, Zap, Crown,
  ArrowRight, Wand2, Film, Mic, FolderOpen, History, Trash2, Plus, Folder
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
}

export default function DashboardPage() {
  const { profile } = useAuth();
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
        window.location.href = `/history?project_id=${data.project?.id}`;
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
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
              一站式AI生图、视频生成、音乐制作创作平台，让你的想象变为现实
            </p>

            {/* Stats */}
            {profile && (
              <div className="flex items-center justify-center gap-6 pt-4">
                <div className="flex items-center gap-2 text-sm">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  <span className="text-muted-foreground">算力点:</span>
                  <span className="font-bold text-cyan-400">{profile.credits}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-muted-foreground">会员:</span>
                  <span className="font-bold text-amber-400">
                    {profile.vip_level === 'free' ? '免费' : profile.vip_level}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Four Core Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold">我的项目</h2>
              <p className="text-muted-foreground mt-1">管理创作项目</p>
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
              <Link key={project.id} href={`/history?project_id=${project.id}`}>
                <Card className="group overflow-hidden border-border/50 bg-card/50 hover:bg-card/80 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 cursor-pointer h-36">
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
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick Links */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/projects">
            <Card className="group hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-cyan-500/10 group-hover:bg-cyan-500/20 transition-colors">
                  <FolderOpen className="w-5 h-5 text-cyan-500" />
                </div>
                <div>
                  <p className="font-medium">我的项目</p>
                  <p className="text-sm text-muted-foreground">管理创作项目</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/history">
            <Card className="group hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-violet-500/10 group-hover:bg-violet-500/20 transition-colors">
                  <History className="w-5 h-5 text-violet-500" />
                </div>
                <div>
                  <p className="font-medium">历史记录</p>
                  <p className="text-sm text-muted-foreground">查看所有创作</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/trash">
            <Card className="group hover:border-cyan-500/30 transition-all duration-300 hover:-translate-y-1 cursor-pointer">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                  <Trash2 className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium">回收站</p>
                  <p className="text-sm text-muted-foreground">恢复已删除作品</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Recharge CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="relative overflow-hidden border-cyan-500/20 bg-gradient-to-r from-cyan-950/50 via-blue-950/50 to-violet-950/50">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
          </div>
          <CardContent className="relative p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                充值算力点，解锁更多创作可能
              </h3>
              <p className="text-muted-foreground mt-2">首充额外赠送算力点，VIP会员享受专属折扣与高清模板</p>
            </div>
            <Link href="/recharge">
              <Button size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium px-8">
                <Zap className="w-4 h-4 mr-2" />
                立即充值
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
