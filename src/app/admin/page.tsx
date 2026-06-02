'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, CreditCard, Zap, Download, Shield
} from 'lucide-react';

interface Profile {
  id: string;
  nickname: string;
  credits: number;
  vip_level: string;
  vip_expires_at: string;
  created_at: string;
}

interface Order {
  id: string;
  order_no: string;
  user_id: string;
  package_name: string;
  amount: number;
  credits: number;
  payment_method: string;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [credits, setCredits] = useState<Record<string, unknown>[]>([]);

  const fetchData = useCallback(async () => {
    if (!user || !profile?.is_admin) return;
    try {
      const [usersRes, ordersRes, creditsRes] = await Promise.all([
        fetch(`/api/admin?tab=users`, { credentials: 'include' }),
        fetch(`/api/admin?tab=orders`, { credentials: 'include' }),
        fetch(`/api/admin?tab=credits`, { credentials: 'include' }),
      ]);
      const [usersData, ordersData, creditsData] = await Promise.all([
        usersRes.json(), ordersRes.json(), creditsRes.json(),
      ]);
      if (usersData.data) setUsers(usersData.data);
      if (ordersData.data) setOrders(ordersData.data);
      if (creditsData.data) setCredits(creditsData.data);
    } catch (err) {
      console.error(err);
    }
  }, [user, profile]);

  useEffect(() => {
    if (profile && !profile.is_admin) {
      router.push('/dashboard');
      return;
    }
    fetchData();
  }, [profile, router, fetchData]);

  if (!profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-96 border-red-500/30">
          <CardContent className="p-6 text-center">
            <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-lg font-medium">无管理员权限</p>
            <p className="text-muted-foreground mt-2">请联系管理员获取权限</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">管理后台</h1>
          <p className="text-muted-foreground mt-2">用户管理、订单管理、算力统计</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">注册用户</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{orders.filter(o => o.status === 'completed').length}</p>
                <p className="text-xs text-muted-foreground">成功订单</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {orders.filter(o => o.status === 'completed').reduce((s, o) => s + o.amount, 0).toFixed(0)}
                </p>
                <p className="text-xs text-muted-foreground">总收入(元)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" />用户</TabsTrigger>
            <TabsTrigger value="orders"><CreditCard className="w-4 h-4 mr-1" />订单</TabsTrigger>
            <TabsTrigger value="credits"><Zap className="w-4 h-4 mr-1" />算力</TabsTrigger>
          </TabsList>

          <div className="mt-6 overflow-x-auto">
            {tab === 'users' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">昵称</th>
                    <th className="text-left py-3 px-4">算力</th>
                    <th className="text-left py-3 px-4">会员</th>
                    <th className="text-left py-3 px-4">到期</th>
                    <th className="text-left py-3 px-4">注册时间</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-3 px-4">{u.nickname}</td>
                      <td className="py-3 px-4 text-cyan-400">{u.credits}</td>
                      <td className="py-3 px-4">{u.vip_level}</td>
                      <td className="py-3 px-4">{u.vip_expires_at ? new Date(u.vip_expires_at).toLocaleDateString() : '-'}</td>
                      <td className="py-3 px-4">{new Date(u.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'orders' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">订单号</th>
                    <th className="text-left py-3 px-4">套餐</th>
                    <th className="text-left py-3 px-4">金额</th>
                    <th className="text-left py-3 px-4">支付方式</th>
                    <th className="text-left py-3 px-4">状态</th>
                    <th className="text-left py-3 px-4">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono text-xs">{o.order_no}</td>
                      <td className="py-3 px-4">{o.package_name}</td>
                      <td className="py-3 px-4 text-green-400">¥{o.amount}</td>
                      <td className="py-3 px-4">{o.payment_method === 'wechat' ? '微信' : '支付宝'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          o.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                          o.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {o.status === 'completed' ? '已完成' : o.status === 'pending' ? '待支付' : '已取消'}
                        </span>
                      </td>
                      <td className="py-3 px-4">{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'credits' && (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">类型</th>
                    <th className="text-left py-3 px-4">变动</th>
                    <th className="text-left py-3 px-4">余额</th>
                    <th className="text-left py-3 px-4">描述</th>
                    <th className="text-left py-3 px-4">时间</th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map((c, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-3 px-4">{String(c.type)}</td>
                      <td className="py-3 px-4 text-cyan-400">+{String(c.amount)}</td>
                      <td className="py-3 px-4">{String(c.balance_after)}</td>
                      <td className="py-3 px-4">{String(c.description)}</td>
                      <td className="py-3 px-4">{new Date(String(c.created_at)).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
