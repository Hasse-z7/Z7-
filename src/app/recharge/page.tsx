'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Zap, Check, Clock, ArrowUpRight, ArrowDownLeft, Gift, LogIn, Info,
} from 'lucide-react';

interface Package {
  id: string;
  name: string;
  type: string;
  price: number;
  credits: number;
  bonus_credits: number;
  duration_days: number;
  is_first_charge_bonus: boolean;
  is_active: boolean;
  sort_order: number;
}

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
}

interface Order {
  id: string;
  order_no: string;
  package_name: string;
  amount: number;
  credits_granted: number;
  payment_method: string;
  status: string;
  created_at: string;
  paid_at: string | null;
}

// 算力消耗说明
const COST_RULES = [
  { label: 'AI生图', value: '1~20算力点/张' },
  { label: 'AI视频', value: '1~30算力点/秒' },
  { label: 'AI音乐', value: '10算力点/首' },
  { label: '首充优惠', value: '充值即享额外赠送' },
];

// 充值套餐推荐标签
const PACKAGE_TAGS: Record<number, string> = {
  0: '',           // 10元
  1: '',           // 50元
  2: '推荐',       // 100元
  3: '超值',       // 300元
  4: '豪华',       // 500元
};

export default function RechargePage() {
  const { profile, user, refreshProfile } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 账单记录
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'recharge' | 'orders' | 'billing'>('recharge');

  // 订单记录
  const [orders, setOrders] = useState<Order[]>([]);

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/recharge/packages');
      const data = await res.json();
      if (data.packages) setPackages(data.packages);
    } catch (err) {
      console.error('Fetch packages error:', err);
    }
  }, []);

  const fetchTransactions = useCallback(async (page: number) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/credits?page=${page}&page_size=20`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (data.transactions) {
        setTransactions(data.transactions);
        setTxTotal(data.total);
        setTxPage(page);
      }
    } catch (err) {
      console.error('Fetch transactions error:', err);
    }
  }, [user]);

  const fetchOrders = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/orders', {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (data.orders) setOrders(data.orders);
    } catch (err) {
      console.error('Fetch orders error:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  useEffect(() => {
    if (user) fetchTransactions(1);
    if (user) fetchOrders();
  }, [user, fetchTransactions, fetchOrders]);

  const creditPackages = packages.filter(p => p.type === 'credits');

  // 获取交易类型图标和颜色
  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) {
      switch (type) {
        case 'recharge': return { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
        case 'daily_login': return { icon: LogIn, color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
        case 'register_bonus': return { icon: Gift, color: 'text-amber-400', bg: 'bg-amber-500/10' };
        default: return { icon: ArrowDownLeft, color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
      }
    } else {
      return { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/10' };
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Success Toast */}
      {successToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3 bg-emerald-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-lg shadow-emerald-500/20">
            <Check className="w-5 h-5 shrink-0" />
            <span className="font-medium">{successToast}</span>
            <button onClick={() => setSuccessToast(null)} className="ml-2 hover:bg-white/20 rounded-full p-0.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 顶部：算力余额卡片 */}
        <div className="mb-8">
          <Card className="overflow-hidden border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <Zap className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">当前算力余额</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                        {profile?.credits ?? 0}
                      </span>
                      <span className="text-sm text-muted-foreground">算力点</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <p className="text-muted-foreground">免费算力</p>
                    <p className="font-semibold text-cyan-400">{profile?.free_credits ?? 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground">付费算力</p>
                    <p className="font-semibold text-blue-400">{profile?.paid_credits ?? 0}</p>
                  </div>
                </div>
              </div>
              {/* 算力消耗说明 */}
              <div className="mt-4 pt-4 border-t border-border/30">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                  {COST_RULES.map((rule) => (
                    <span key={rule.label} className="flex items-center gap-1">
                      <span className="text-foreground/70">{rule.label}</span>
                      <span className="text-cyan-400">{rule.value}</span>
                    </span>
                  ))}
                  <span className="text-foreground/70">1元 = 10算力点，永久有效不清零</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tab切换 */}
        <div className="mb-6 flex items-center gap-1 p-1 bg-muted/50 rounded-lg w-fit">
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'recharge'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('recharge')}
          >
            充值套餐
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'orders'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('orders')}
          >
            充值订单
          </button>
          <button
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === 'billing'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('billing')}
          >
            算力明细
          </button>
        </div>

        {/* 充值套餐 Tab */}
        {activeTab === 'recharge' && (
          <>
            {/* 充值说明 */}
            <Card className="mb-6 border-cyan-500/20 bg-cyan-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-cyan-400">充值方式</p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      算力充值由管理员统一操作，如需充值请联系管理员，提供您的注册手机号和所需套餐。管理员将在后台为您完成充值，算力即时到账。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 套餐展示 */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-400" /> 算力套餐
                </h2>
                <span className="text-xs text-muted-foreground">1元 = 10算力点 · 永久有效</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {creditPackages.map((pkg, idx) => {
                  const totalCredits = pkg.credits + (pkg.bonus_credits || 0);
                  const tag = PACKAGE_TAGS[idx] || '';

                  return (
                    <Card
                      key={pkg.id}
                      className="relative overflow-hidden group border-border/50 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 transition-all duration-300"
                    >
                      {/* 推荐标签 */}
                      {tag && (
                        <div className="absolute top-0 right-0 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-[10px] px-2 py-0.5 rounded-bl-lg font-medium">
                          {tag}
                        </div>
                      )}
                      <CardContent className="p-5 text-center">
                        <p className="text-3xl font-bold text-cyan-400">¥{pkg.price}</p>
                        <div className="mt-2">
                          <span className="text-lg font-semibold">{totalCredits}</span>
                          <span className="text-sm text-muted-foreground ml-1">算力点</span>
                        </div>
                        {pkg.bonus_credits > 0 && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[10px] px-1.5">
                              +赠送{pkg.bonus_credits}点
                            </Badge>
                          </div>
                        )}
                        {/* 单价换算 */}
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          约{(pkg.price / totalCredits * 10).toFixed(1)}元/百点
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* 充值订单 Tab */}
        {activeTab === 'orders' && (
          <section>
            {orders.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="p-12 text-center">
                  <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">暂无订单记录</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">充值后订单将在这里显示</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {orders.map((order) => {
                  const statusMap: Record<string, { label: string; color: string }> = {
                    completed: { label: '已完成', color: 'text-emerald-400 bg-emerald-500/10' },
                    pending: { label: '待支付', color: 'text-amber-400 bg-amber-500/10' },
                    failed: { label: '失败', color: 'text-red-400 bg-red-500/10' },
                    refunded: { label: '已退款', color: 'text-slate-400 bg-slate-500/10' },
                  };
                  const st = statusMap[order.status] || statusMap.pending;
                  return (
                    <Card key={order.id} className="border-border/30 hover:border-border/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl ${st.color} flex items-center justify-center`}>
                              <Zap className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{order.package_name || '充值订单'}</p>
                              <p className="text-xs text-muted-foreground">{order.order_no}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">¥{order.amount}</p>
                            <div className="flex items-center gap-2 justify-end">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${st.color}`}>{st.label}</span>
                              <span className="text-xs text-muted-foreground">{order.credits_granted}算力</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 pt-2 border-t border-border/20 text-xs text-muted-foreground">
                          {order.paid_at ? formatTime(order.paid_at) : formatTime(order.created_at)}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* 算力明细 Tab */}
        {activeTab === 'billing' && (
          <section>
            {transactions.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="p-12 text-center">
                  <Clock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-muted-foreground">暂无账单记录</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">充值或使用AI创作后，记录将在这里显示</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {transactions.map((tx) => {
                  const { icon: TxIcon, color, bg } = getTransactionIcon(tx.type, tx.amount);
                  return (
                    <Card key={tx.id} className="border-border/30 hover:border-border/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                              <TxIcon className={`w-5 h-5 ${color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{tx.description}</p>
                              <p className="text-xs text-muted-foreground">{formatTime(tx.created_at)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-semibold ${tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {tx.amount > 0 ? '+' : ''}{tx.amount}
                            </p>
                            <p className="text-xs text-muted-foreground">余额 {tx.balance_after}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* 分页 */}
                {txTotal > 20 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage <= 1}
                      onClick={() => fetchTransactions(txPage - 1)}
                    >
                      上一页
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      第 {txPage} 页 / 共 {Math.ceil(txTotal / 20)} 页
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={txPage >= Math.ceil(txTotal / 20)}
                      onClick={() => fetchTransactions(txPage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
