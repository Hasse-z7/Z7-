'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, Zap, Check, ArrowRight } from 'lucide-react';

const tiers = [
  {
    name: '免费用户',
    price: 0,
    features: ['每日3次生图', '每日1次视频', '每日1次音乐', '基础模板', '标清输出'],
    color: 'from-slate-500 to-slate-600',
    current: true,
  },
  {
    name: '月度VIP',
    price: 49.9,
    features: ['每日50次生图', '每日20次视频', '每日10次音乐', '全部模板', '高清/4K输出', '优先队列'],
    color: 'from-cyan-500 to-blue-600',
  },
  {
    name: '季度VIP',
    price: 129,
    features: ['月度VIP全部权益', '季度专属折扣', '1800算力赠送', '专属客服通道'],
    color: 'from-violet-500 to-purple-600',
  },
  {
    name: '年度VIP',
    price: 399,
    features: ['季度VIP全部权益', '年度最优折扣', '8000算力赠送', '新品抢先体验', '定制化模板服务'],
    color: 'from-amber-500 to-orange-600',
  },
];

export default function MembershipPage() {
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            会员权益
          </h1>
          <p className="text-muted-foreground mt-2">升级VIP，解锁全部创作能力</p>
          {profile && (
            <Badge variant="outline" className="mt-4 text-amber-400 border-amber-400/30">
              <Crown className="w-3 h-3 mr-1" /> 当前: {profile.vip_level === 'free' ? '免费用户' : 'VIP会员'}
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {tiers.map((tier) => (
            <Card key={tier.name} className="relative overflow-hidden border-border/50 hover:border-primary/30 transition-all hover:-translate-y-1">
              {tier.name === '年度VIP' && (
                <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-3 py-1 rounded-bl-lg font-medium">
                  推荐
                </div>
              )}
              <CardHeader className="text-center">
                <div className={`mx-auto w-12 h-12 rounded-full bg-gradient-to-br ${tier.color} flex items-center justify-center mb-3`}>
                  <Crown className="w-6 h-6 text-white" />
                </div>
                <CardTitle>{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="text-3xl font-bold">¥{tier.price}</span>
                  {tier.price > 0 && <span className="text-sm text-muted-foreground">/期</span>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tier.features.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
                <Link href="/recharge">
                  <Button className={`w-full mt-4 bg-gradient-to-r ${tier.color} text-white font-medium`}>
                    {tier.price === 0 ? '当前方案' : '立即开通'} <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
