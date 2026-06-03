'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, CreditCard, Zap, Shield, Cpu, Plus, Trash2, Edit2, Check, X as XIcon
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

interface AIModel {
  id: string;
  name: string;
  endpoint_id: string;
  category: string;
  is_active: boolean;
  sort_order: number;
  description: string;
}

export default function AdminPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [credits, setCredits] = useState<Record<string, unknown>[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [showModelForm, setShowModelForm] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [modelForm, setModelForm] = useState({ name: '', endpoint_id: '', category: 'video', description: '' });

  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/models', { credentials: 'include', headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (data.models) setModels(data.models);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!user || !profile?.is_admin) return;
    try {
      const [usersRes, ordersRes, creditsRes] = await Promise.all([
        fetch(`/api/admin?tab=users`, { credentials: 'include', headers: { ...getAuthHeaders() } }),
        fetch(`/api/admin?tab=orders`, { credentials: 'include', headers: { ...getAuthHeaders() } }),
        fetch(`/api/admin?tab=credits`, { credentials: 'include', headers: { ...getAuthHeaders() } }),
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
    fetchModels();
  }, [profile, router, fetchData, fetchModels]);

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
            <TabsTrigger value="models"><Cpu className="w-4 h-4 mr-1" />模型</TabsTrigger>
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
                      <td className="py-3 px-4 text-cyan-400">{u.credits} 算力点</td>
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

            {tab === 'models' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">管理AI生图/生视频可选模型，新增后自动同步至前端下拉选择框</p>
                  <Button size="sm" onClick={() => { setEditingModel(null); setModelForm({ name: '', endpoint_id: '', category: 'video', description: '' }); setShowModelForm(true); }}>
                    <Plus className="w-4 h-4 mr-1" />新增模型
                  </Button>
                </div>

                {showModelForm && (
                  <Card className="border-cyan-500/30">
                    <CardContent className="p-4 space-y-3">
                      <h3 className="font-medium">{editingModel ? '编辑模型' : '新增模型'}</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">模型名称</label>
                          <input className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm" placeholder="如：Seedance 1.5 Pro" value={modelForm.name} onChange={e => setModelForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">模型Endpoint ID</label>
                          <input className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm font-mono" placeholder="如：ark-xxxx 或 doubao-xxxx" value={modelForm.endpoint_id} onChange={e => setModelForm(f => ({ ...f, endpoint_id: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">类型</label>
                          <select className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm" value={modelForm.category} onChange={e => setModelForm(f => ({ ...f, category: e.target.value }))}>
                            <option value="video">视频生成</option>
                            <option value="image">图片生成</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">描述</label>
                          <input className="w-full mt-1 px-3 py-2 rounded-md border border-border bg-background text-sm" placeholder="模型描述（可选）" value={modelForm.description} onChange={e => setModelForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowModelForm(false)}><XIcon className="w-4 h-4 mr-1" />取消</Button>
                        <Button size="sm" onClick={async () => {
                          if (!modelForm.name.trim() || !modelForm.endpoint_id.trim()) return;
                          const url = editingModel ? `/api/models?id=${editingModel.id}` : '/api/models';
                          const method = editingModel ? 'PUT' : 'POST';
                          const res = await fetch(url, {
                            method,
                            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
                            body: JSON.stringify(modelForm),
                          });
                          if (res.ok) {
                            setShowModelForm(false);
                            fetchModels();
                          }
                        }}><Check className="w-4 h-4 mr-1" />{editingModel ? '保存' : '新增'}</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4">模型名称</th>
                      <th className="text-left py-3 px-4">Endpoint ID</th>
                      <th className="text-left py-3 px-4">类型</th>
                      <th className="text-left py-3 px-4">状态</th>
                      <th className="text-left py-3 px-4">描述</th>
                      <th className="text-left py-3 px-4">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {models.map((m) => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-muted/50">
                        <td className="py-3 px-4 font-medium">{m.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-cyan-400">{m.endpoint_id}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-xs ${m.category === 'video' ? 'bg-purple-500/10 text-purple-400' : 'bg-blue-500/10 text-blue-400'}`}>
                            {m.category === 'video' ? '视频' : '图片'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded text-xs ${m.is_active ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                            {m.is_active ? '启用' : '停用'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">{m.description || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingModel(m);
                              setModelForm({ name: m.name, endpoint_id: m.endpoint_id, category: m.category, description: m.description || '' });
                              setShowModelForm(true);
                            }}><Edit2 className="w-3 h-3" /></Button>
                            <Button variant="ghost" size="sm" onClick={async () => {
                              if (confirm('确定删除此模型？')) {
                                await fetch(`/api/models?id=${m.id}`, { method: 'DELETE', headers: { ...getAuthHeaders() } });
                                fetchModels();
                              }
                            }}><Trash2 className="w-3 h-3 text-red-400" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </div>
  );
}
