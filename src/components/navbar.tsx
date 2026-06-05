'use client';

import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, Video, Music, UserRound, CreditCard, LogOut,
  Sun, Moon, Search, Menu, X, FolderOpen, Crown, History, Trash2,
  ChevronRight, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

// 路径映射表
const pathNameMap: Record<string, string> = {
  '/projects': '我的项目',
  '/create/image': 'AI生图',
  '/create/video': 'AI视频',
  '/create/music': 'AI音乐',
  '/create/digital-human': 'AI数字人',
  '/dashboard': '个人中心',
  '/dashboard/profile': '个人资料',
  '/recharge': '充值中心',
  '/membership': '会员权益',
  '/my-works': '我的作品',
  '/login': '登录',
  '/register': '注册',
};

function Breadcrumb() {
  const pathname = usePathname();
  
  const crumbs = useMemo(() => {
    // 特殊处理项目详情页
    if (pathname.startsWith('/projects/') && pathname !== '/projects') {
      return [
        { label: '我的项目', href: '/projects' },
        { label: '项目详情', href: pathname },
      ];
    }
    
    const parts = pathname.split('/').filter(Boolean);
    const result: { label: string; href: string }[] = [];
    let currentPath = '';
    
    for (const part of parts) {
      currentPath += `/${part}`;
      const name = pathNameMap[currentPath];
      if (name) {
        result.push({ label: name, href: currentPath });
      }
    }
    
    return result;
  }, [pathname]);

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
      <Link href="/" className="hover:text-foreground transition-colors">
        <Home className="h-3 w-3" />
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          {i < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default function Navbar() {
  const { user, profile, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { setMounted(true); }, []);

  const navLinks = [
    { href: '/create/image', label: 'AI生图', icon: Sparkles },
    { href: '/create/video', label: 'AI视频', icon: Video },
    { href: '/create/music', label: 'AI音乐', icon: Music },
  ];

  const projectLinks = [
    { href: '/projects', label: '项目管理', icon: FolderOpen },
    { href: '/history', label: '历史记录', icon: History },
    { href: '/trash', label: '回收站', icon: Trash2 },
  ];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const creditsDisplay = profile ? (
    <Badge variant="outline" className="hidden sm:flex items-center gap-1 border-cyan-500/50 text-cyan-400">
      <CreditCard className="h-3 w-3" />
      {profile.credits} 算力点
    </Badge>
  ) : null;

  const vipBadge = profile && profile.vip_level !== 'free' ? (
    <Badge className="hidden sm:flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0">
      <Crown className="h-3 w-3" />
      VIP
    </Badge>
  ) : null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo + Breadcrumb */}
        <div className="flex flex-col shrink-0">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="燃冬AI" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-bold text-lg bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent hidden sm:inline">
              燃冬AI
            </span>
          </Link>
          <Breadcrumb />
        </div>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1 mx-4">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          <span className="w-px h-5 bg-border/50 mx-1" />
          {projectLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Search */}
        <form onSubmit={handleSearch} className="hidden lg:flex items-center mx-2 flex-1 max-w-xs">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索模板、风格..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-background/50 border-border/50"
            />
          </div>
        </form>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {vipBadge}
          {creditsDisplay}

          {/* Theme toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={profile?.avatar_url || ''} />
                    <AvatarFallback className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white text-xs">
                      {profile?.nickname?.charAt(0) || user.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm">{profile?.nickname || user.email?.split('@')[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                  <UserRound className="mr-2 h-4 w-4" />个人中心
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/recharge')}>
                  <CreditCard className="mr-2 h-4 w-4" />充值中心
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/my-works')}>
                  <FolderOpen className="mr-2 h-4 w-4" />我的作品
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/membership')}>
                  <Crown className="mr-2 h-4 w-4" />会员权益
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await logout(); router.push('/login'); }} className="text-red-500">
                  <LogOut className="mr-2 h-4 w-4" />退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm">登录</Button>
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white border-0">
                  注册
                </Button>
              </Link>
            </div>
          )}

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
          <div className="container px-4 py-3 space-y-1">
            {navLinks.concat(projectLinks).map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-accent"
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
