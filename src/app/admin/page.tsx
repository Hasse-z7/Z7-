'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, CreditCard, Zap, Shield, Cpu, Plus, Trash2, Edit2, Check, X as XIcon, Settings, Bug, Wallet, Search, Loader2
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
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" />用户</TabsTrigger>
            <TabsTrigger value="orders"><CreditCard className="w-4 h-4 mr-1" />订单</TabsTrigger>
            <TabsTrigger value="credits"><Zap className="w-4 h-4 mr-1" />算力</TabsTrigger>
            <TabsTrigger value="models"><Cpu className="w-4 h-4 mr-1" />模型</TabsTrigger>
            <TabsTrigger value="system"><Settings className="w-4 h-4 mr-1" />系统</TabsTrigger>
            <TabsTrigger value="selftest"><Shield className="w-4 h-4 mr-1" />自检</TabsTrigger>
            <TabsTrigger value="recharge"><Wallet className="w-4 h-4 mr-1" />算力充值</TabsTrigger>
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

          {/* 系统控制 */}
          {tab === 'system' && (
            <SystemControl />
          )}

          {/* 全功能自检 */}
          {tab === 'recharge' && <AdminRecharge />}
          {tab === 'selftest' && (
            <div className="space-y-6">
              <Card className="border-cyan-500/20 bg-slate-900/50 backdrop-blur">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bug className="h-5 w-5 text-cyan-400" />
                    全功能一键自检
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-400 mb-4">
                    自动跑完全部7大模块测试：账号体系、AI绘图、AI视频、AI音乐、提示词反推、画面修复、算力充值。点击下方按钮启动，测试结果实时展示。
                  </p>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
                    onClick={() => window.open('/admin/self-test', '_blank')}
                  >
                    <Bug className="h-4 w-4 mr-2" />
                    打开自检工作台
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

        </Tabs>
      </div>
    </div>
  );
}

/** 系统控制面板组件 */
function SystemControl() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [announcementText, setAnnouncementText] = useState('');
  const [announcementEnabled, setAnnouncementEnabled] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('sb-access-token');
      const res = await fetch('/api/system-config', {
        headers: { 'x-session': token || '' },
      });
      const data = await res.json();
      if (data.config) {
        setConfig(data.config);
        // Parse announcement
        try {
          const ann = JSON.parse(data.config.announcement || '{}');
          setAnnouncementText(ann.text || '');
          setAnnouncementEnabled(ann.enabled || false);
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to fetch system config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const updateConfig = async (key: string, value: string) => {
    setSaving(key);
    try {
      const token = localStorage.getItem('sb-access-token');
      const res = await fetch('/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-session': token || '' },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (data.success) {
        setConfig(prev => ({ ...prev, [key]: value }));
      } else {
        alert('更新失败: ' + (data.error || '未知错误'));
      }
    } catch (err) {
      alert('更新失败: ' + String(err));
    } finally {
      setSaving(null);
    }
  };

  const toggleSwitch = (key: string) => {
    const currentValue = config[key] === 'true';
    updateConfig(key, currentValue ? 'false' : 'true');
  };

  const updateAnnouncement = async () => {
    const value = JSON.stringify({ text: announcementText, enabled: announcementEnabled });
    await updateConfig('announcement', value);
  };

  const switches = [
    { key: 'registration_open', label: '开放注册', desc: '关闭后新用户无法注册' },
    { key: 'maintenance_mode', label: '维护模式', desc: '开启后所有AI功能暂停' },
    { key: 'image_generation_open', label: 'AI生图', desc: '关闭后用户无法生成图片' },
    { key: 'video_generation_open', label: 'AI生视频', desc: '关闭后用户无法生成视频' },
    { key: 'music_generation_open', label: 'AI音乐', desc: '关闭后用户无法生成音乐' },
    { key: 'digital_human_open', label: 'AI数字人', desc: '关闭后用户无法使用数字人' },
  ];

  if (loading) {
    return <div className="text-center py-12 text-slate-400">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 功能开关 */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-100">功能开关</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {switches.map(sw => (
              <div key={sw.key} className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div>
                  <div className="font-medium text-slate-200">{sw.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{sw.desc}</div>
                </div>
                <button
                  onClick={() => toggleSwitch(sw.key)}
                  disabled={saving === sw.key}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    config[sw.key] === 'true' ? 'bg-emerald-500' : 'bg-slate-600'
                  } ${saving === sw.key ? 'opacity-50' : ''}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    config[sw.key] === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 全局公告 */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-100">全局公告</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAnnouncementEnabled(!announcementEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  announcementEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  announcementEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <span className="text-sm text-slate-300">启用公告</span>
            </div>
            <textarea
              value={announcementText}
              onChange={(e) => setAnnouncementText(e.target.value)}
              placeholder="输入公告内容..."
              className="w-full h-24 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 p-3 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <Button onClick={updateAnnouncement} disabled={saving === 'announcement'} size="sm">
              保存公告
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 参数配置 */}
      <Card className="bg-slate-900/50 border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-100">参数配置</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <label className="text-sm text-slate-300">每用户同时AI任务上限</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={config.max_concurrent_per_user || '3'}
                  onChange={(e) => setConfig(prev => ({ ...prev, max_concurrent_per_user: e.target.value }))}
                  className="w-20 rounded bg-slate-700 border border-slate-600 text-slate-200 p-1.5 text-sm text-center"
                  min={1}
                  max={20}
                />
                <Button size="sm" onClick={() => updateConfig('max_concurrent_per_user', config.max_concurrent_per_user || '3')}>
                  保存
                </Button>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <label className="text-sm text-slate-300">排队超时秒数</label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={config.queue_timeout_seconds || '60'}
                  onChange={(e) => setConfig(prev => ({ ...prev, queue_timeout_seconds: e.target.value }))}
                  className="w-20 rounded bg-slate-700 border border-slate-600 text-slate-200 p-1.5 text-sm text-center"
                  min={10}
                  max={300}
                />
                <Button size="sm" onClick={() => updateConfig('queue_timeout_seconds', config.queue_timeout_seconds || '60')}>
                  保存
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ========== 管理员算力充值组件 ==========
function AdminRecharge() {
  const [searchInput, setSearchInput] = useState('');
  const [searchType, setSearchType] = useState<'phone' | 'userId'>('phone');
  const [searching, setSearching] = useState(false);
  const [recharging, setRecharging] = useState(false);
  const [userResult, setUserResult] = useState<{
    id: string;
    user_id: string;
    phone: string;
    email: string;
    credits: number;
    free_credits: number;
    paid_credits: number;
    vip_level: number;
    created_at: string;
  } | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState('');
  const [rechargeType, setRechargeType] = useState<'free' | 'paid'>('paid');
  const [rechargeDesc, setRechargeDesc] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      setMessage({ type: 'error', text: searchType === 'phone' ? '请输入手机号' : '请输入用户ID' });
      return;
    }
    setSearching(true);
    setMessage(null);
    setUserResult(null);
    try {
      const param = searchType === 'phone' 
        ? `phone=${encodeURIComponent(searchInput.trim())}`
        : `userId=${encodeURIComponent(searchInput.trim())}`;
      const res = await fetch(`/api/admin/recharge?${param}`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '查询失败' });
      } else {
        setUserResult(data.user);
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setSearching(false);
    }
  };

  const handleRecharge = async () => {
    if (!userResult) return;
    const amount = parseInt(rechargeAmount);
    if (!amount || amount <= 0) {
      setMessage({ type: 'error', text: '请输入有效的充值算力数量' });
      return;
    }
    if (!rechargeDesc.trim()) {
      setMessage({ type: 'error', text: '请填写充值说明' });
      return;
    }
    setRecharging(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          userId: userResult.id,
          amount,
          creditsType: rechargeType,
          description: rechargeDesc.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || '充值失败' });
      } else {
        setMessage({ type: 'success', text: `成功充值 ${amount} 算力点（${rechargeType === 'free' ? '免费' : '付费'}）` });
        // Refresh user data
        setUserResult(prev => prev ? {
          ...prev,
          credits: data.newCredits ?? prev.credits + amount,
          free_credits: data.newFreeCredits ?? prev.free_credits,
          paid_credits: data.newPaidCredits ?? prev.paid_credits,
        } : null);
        setRechargeAmount('');
        setRechargeDesc('');
      }
    } catch {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setRecharging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 搜索区 */}
      <Card className="border-cyan-500/20 bg-slate-900/50 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-cyan-400" />
            管理员算力充值
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">通过手机号或用户ID查询账户信息，然后进行算力充值</p>
          <div className="flex gap-2 items-center">
            <div className="flex rounded-md overflow-hidden border border-slate-600">
              <button
                onClick={() => setSearchType('phone')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${searchType === 'phone' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                手机号
              </button>
              <button
                onClick={() => setSearchType('userId')}
                className={`px-3 py-2 text-xs font-medium transition-colors ${searchType === 'userId' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
              >
                用户ID
              </button>
            </div>
            <input
              type="text"
              placeholder={searchType === 'phone' ? '输入手机号查询...' : '输入用户ID查询...'}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            />
            <Button
              onClick={handleSearch}
              disabled={searching}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white"
            >
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              查询
            </Button>
          </div>
          {message && (
            <div className={`rounded-md px-4 py-3 text-sm ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {message.text}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 用户信息 + 充值 */}
      {userResult && (
        <Card className="border-cyan-500/20 bg-slate-900/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-lg">用户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="rounded-lg bg-slate-800/50 p-4">
                <div className="text-xs text-slate-400 mb-1">用户ID</div>
                <div className="text-xs font-mono text-slate-100 truncate" title={userResult.user_id}>{userResult.user_id?.slice(0, 12)}...</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-4">
                <div className="text-xs text-slate-400 mb-1">手机号</div>
                <div className="text-lg font-semibold text-slate-100">{userResult.phone || '-'}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-4">
                <div className="text-xs text-slate-400 mb-1">邮箱</div>
                <div className="text-sm font-semibold text-slate-100 truncate">{userResult.email || '-'}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-4">
                <div className="text-xs text-slate-400 mb-1">当前总算力</div>
                <div className="text-2xl font-bold text-cyan-400">{userResult.credits}</div>
              </div>
              <div className="rounded-lg bg-slate-800/50 p-4">
                <div className="text-xs text-slate-400 mb-1">VIP等级</div>
                <div className="text-lg font-semibold text-amber-400">Lv.{userResult.vip_level}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-4">
                <div className="text-xs text-slate-400 mb-1">免费算力</div>
                <div className="text-xl font-bold text-emerald-400">{userResult.free_credits}</div>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-4">
                <div className="text-xs text-slate-400 mb-1">付费算力</div>
                <div className="text-xl font-bold text-blue-400">{userResult.paid_credits}</div>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-6">
              <h3 className="text-base font-semibold text-slate-200 mb-4">充值算力</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 mb-1 block">充值算力数量</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="输入算力点数"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(e.target.value)}
                      className="w-full rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div className="w-40">
                    <label className="text-xs text-slate-400 mb-1 block">算力类型</label>
                    <select
                      value={rechargeType}
                      onChange={(e) => setRechargeType(e.target.value as 'free' | 'paid')}
                      className="w-full rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="paid">付费算力</option>
                      <option value="free">免费算力</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">充值说明（必填）</label>
                  <input
                    type="text"
                    placeholder="如：管理员手动充值、活动赠送等"
                    value={rechargeDesc}
                    onChange={(e) => setRechargeDesc(e.target.value)}
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-400">
                    充值后总算力：<span className="text-cyan-400 font-semibold">{userResult.credits + (parseInt(rechargeAmount) || 0)}</span> 算力点
                  </div>
                  <Button
                    onClick={handleRecharge}
                    disabled={recharging || !rechargeAmount || !rechargeDesc.trim()}
                    className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white"
                  >
                    {recharging ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wallet className="h-4 w-4 mr-2" />}
                    确认充值
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500">
              注册时间：{new Date(userResult.created_at).toLocaleString('zh-CN')}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
