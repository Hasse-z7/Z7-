'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sparkles, Wand2, Film, Mic, Zap, Crown, ArrowRight,
  ImageIcon, Video, Music
} from 'lucide-react';

const features = [
  { title: 'AI生图', desc: '文字生成精美图片，多种风格随心选择', icon: Wand2, href: '/create/image', gradient: 'from-violet-500 to-purple-600', glow: 'bg-violet-500/20' },
  { title: 'AI视频', desc: '文字/图片生成视频，画质增强', icon: Film, href: '/create/video', gradient: 'from-cyan-500 to-blue-600', glow: 'bg-cyan-500/20' },
  { title: 'AI音乐', desc: '文字生成歌曲，多曲风切换', icon: Mic, href: '/create/music', gradient: 'from-rose-500 to-pink-600', glow: 'bg-rose-500/20' },
];

const showcases = [
  { name: '超写实人像', cat: 'image', icon: ImageIcon, gradient: 'from-violet-500/20 to-purple-500/20' },
  { name: '二次元少女', cat: 'image', icon: ImageIcon, gradient: 'from-pink-500/20 to-rose-500/20' },
  { name: '国风水墨', cat: 'image', icon: ImageIcon, gradient: 'from-emerald-500/20 to-teal-500/20' },
  { name: '赛博朋克', cat: 'image', icon: ImageIcon, gradient: 'from-cyan-500/20 to-blue-500/20' },
  { name: '影视短片', cat: 'video', icon: Video, gradient: 'from-blue-500/20 to-indigo-500/20' },
  { name: '风景大片', cat: 'video', icon: Video, gradient: 'from-green-500/20 to-emerald-500/20' },
  { name: '流行音乐', cat: 'music', icon: Music, gradient: 'from-rose-500/20 to-pink-500/20' },
];

export default function HomePage() {
  const { user, profile } = useAuth();
  const router = useRouter();

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
                <span className="flex items-center gap-2 text-sm"><Zap className="w-4 h-4 text-cyan-400" /> 算力: <b className="text-cyan-400">{profile.credits}</b></span>
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

      {/* Showcase */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h2 className="text-2xl font-bold mb-2">热门模板</h2>
        <p className="text-muted-foreground mb-8">精选AI创作模板，一键生成</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {showcases.map((s, i) => (
            <Link key={i} href={user ? `/create/${s.cat}` : '/login'}>
              <Card className="group overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:-translate-y-1 cursor-pointer">
                <div className={`h-28 bg-gradient-to-br ${s.gradient} flex items-center justify-center`}>
                  <s.icon className="w-10 h-10 text-foreground/20" />
                </div>
                <CardContent className="p-3">
                  <p className="font-medium text-sm">{s.name}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Card className="relative overflow-hidden border-cyan-500/20 bg-gradient-to-r from-cyan-950/50 via-blue-950/50 to-violet-950/50">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
          </div>
          <CardContent className="relative p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-6">
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                新人注册即送10算力
              </h3>
              <p className="text-muted-foreground mt-2">立即注册，免费体验AI生图、视频、音乐创作</p>
            </div>
            <Link href="/register">
              <Button size="lg" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium px-8">
                <Sparkles className="w-4 h-4 mr-2" /> 免费注册
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
