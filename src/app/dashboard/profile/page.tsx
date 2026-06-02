'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  User, Zap, Crown, Settings, LogOut, ImageIcon, Video, Music, Bot, CreditCard
} from 'lucide-react';

export default function ProfilePage() {
  const { profile, user, logout } = useAuth();
  const router = useRouter();
  const [nickname, setNickname] = useState(profile?.nickname || '');

  const handleLogout = async () => {
    await logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Header */}
        <Card className="border-border/50 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-950/50 via-blue-950/50 to-violet-950/50" />
          <CardContent className="relative p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {(profile?.nickname || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold">{profile?.nickname || '用户'}</h2>
              <p className="text-muted-foreground mt-1">{user?.email}</p>
              <div className="flex items-center gap-3 mt-3 justify-center sm:justify-start">
                <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">
                  <Zap className="w-3 h-3 mr-1" /> {profile?.credits || 0} 算力点
                </Badge>
                <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                  <Crown className="w-3 h-3 mr-1" /> {profile?.vip_level === 'free' ? '免费用户' : 'VIP会员'}
                </Badge>
              </div>
            </div>
            <Link href="/recharge">
              <Button className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
                <CreditCard className="w-4 h-4 mr-2" /> 充值
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <Link href="/my-works">
            <Card className="border-border/50 hover:border-cyan-500/30 transition-all cursor-pointer hover:-translate-y-1">
              <CardContent className="p-4 text-center">
                <ImageIcon className="w-6 h-6 mx-auto text-cyan-400 mb-2" />
                <p className="text-sm font-medium">我的作品</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/membership">
            <Card className="border-border/50 hover:border-amber-500/30 transition-all cursor-pointer hover:-translate-y-1">
              <CardContent className="p-4 text-center">
                <Crown className="w-6 h-6 mx-auto text-amber-400 mb-2" />
                <p className="text-sm font-medium">会员权益</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/recharge">
            <Card className="border-border/50 hover:border-green-500/30 transition-all cursor-pointer hover:-translate-y-1">
              <CardContent className="p-4 text-center">
                <CreditCard className="w-6 h-6 mx-auto text-green-400 mb-2" />
                <p className="text-sm font-medium">充值记录</p>
              </CardContent>
            </Card>
          </Link>
          <Card className="border-border/50 hover:border-red-500/30 transition-all cursor-pointer hover:-translate-y-1" onClick={handleLogout}>
            <CardContent className="p-4 text-center">
              <LogOut className="w-6 h-6 mx-auto text-red-400 mb-2" />
              <p className="text-sm font-medium">退出登录</p>
            </CardContent>
          </Card>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">账户信息</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">昵称</span>
                <span>{profile?.nickname || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">邮箱</span>
                <span>{user?.email || '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">注册时间</span>
                <span>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '-'}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-base">会员状态</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">会员等级</span>
                <span className="text-amber-400">{profile?.vip_level === 'free' ? '免费' : 'VIP'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">到期时间</span>
                <span>{profile?.vip_expire_at ? new Date(profile.vip_expire_at).toLocaleDateString() : '-'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">剩余算力点</span>
                <span className="text-cyan-400 font-bold">{profile?.credits || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
