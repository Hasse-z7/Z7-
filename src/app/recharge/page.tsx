'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Zap, Check, CreditCard, QrCode, Upload, AlertCircle,
  ChevronLeft, Clock, ArrowUpRight, ArrowDownLeft, Gift, LogIn,
} from 'lucide-react';
import Image from 'next/image';

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

interface QRCode {
  id: string;
  type: string;
  file_url: string;
  file_key: string;
  is_active: boolean;
  updated_at: string;
}

interface Order {
  id: string;
  order_no: string;
  package_name: string;
  amount: number;
  credits: number;
  credits_granted: number;
  payment_method: string;
  status: string;
  created_at: string;
}

interface Transaction {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string;
  created_at: string;
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
  const [qrcodes, setQrcodes] = useState<QRCode[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [showQRUpload, setShowQRUpload] = useState(false);
  const [showNoQRAlert, setShowNoQRAlert] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<'wechat' | 'alipay'>('wechat');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 支付宝在线支付相关
  const [alipayQRUrl, setAlipayQRUrl] = useState<string | null>(null);
  const [alipayPolling, setAlipayPolling] = useState(false);
  const [alipayPollTimer, setAlipayPollTimer] = useState<NodeJS.Timeout | null>(null);

  // 账单记录
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotal, setTxTotal] = useState(0);
  const [activeTab, setActiveTab] = useState<'recharge' | 'billing'>('recharge');

  const fetchPackages = useCallback(async () => {
    try {
      const res = await fetch('/api/recharge/packages');
      const data = await res.json();
      if (data.packages) setPackages(data.packages);
    } catch (err) {
      console.error('Fetch packages error:', err);
    }
  }, []);

  const fetchQRCodes = useCallback(async () => {
    try {
      const res = await fetch('/api/qrcodes');
      const data = await res.json();
      if (data.qrcodes) {
        setQrcodes(data.qrcodes);
        const hasWechat = data.qrcodes.some((q: QRCode) => q.type === 'wechat' && q.file_url);
        const hasAlipay = data.qrcodes.some((q: QRCode) => q.type === 'alipay' && q.file_url);
        if (!hasWechat || !hasAlipay) {
          setShowNoQRAlert(true);
        }
      }
    } catch (err) {
      console.error('Fetch qrcodes error:', err);
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

  useEffect(() => {
    fetchPackages();
    fetchQRCodes();
  }, [fetchPackages, fetchQRCodes]);

  useEffect(() => {
    if (user) fetchTransactions(1);
  }, [user, fetchTransactions]);

  const wechatQR = qrcodes.find(q => q.type === 'wechat');
  const alipayQR = qrcodes.find(q => q.type === 'alipay');

  const creditPackages = packages.filter(p => p.type === 'credits');

  const handleCreateOrder = async () => {
    if (!selectedPackage || !user) return;
    setLoading(true);
    try {
      // 支付宝走在线支付（当面付）
      if (paymentMethod === 'alipay') {
        const res = await fetch('/api/payment/alipay/create', {
          credentials: 'include',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            package_id: selectedPackage.id,
          }),
        });
        const data = await res.json();
        if (data.qr_code && data.order) {
          setAlipayQRUrl(data.qr_code);
          setCurrentOrder(data.order);
          startAlipayPolling(data.order.id);
        } else {
          alert(data.error || '创建支付宝订单失败，请重试');
        }
      } else {
        // 微信走线下扫码
        const res = await fetch('/api/recharge/create-order', {
          credentials: 'include',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            package_id: selectedPackage.id,
            payment_method: paymentMethod,
          }),
        });
        const data = await res.json();
        if (data.order) {
          setCurrentOrder(data.order);
        } else {
          alert(data.error || '创建订单失败，请重试');
        }
      }
    } catch {
      alert('网络异常，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 支付宝支付状态轮询
  const startAlipayPolling = (orderId: string) => {
    setAlipayPolling(true);
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/payment/alipay/query', {
          credentials: 'include',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ order_id: orderId }),
        });
        const data = await res.json();
        if (data.status === 'TRADE_SUCCESS' || data.status === 'paid') {
          clearInterval(timer);
          setAlipayPolling(false);
          setAlipayQRUrl(null);
          setSuccessToast(`充值成功！已到账 ${data.credits_added || ''} 算力点`);
          setCurrentOrder(null);
          setSelectedPackage(null);
          refreshProfile();
          fetchTransactions(1);
          setTimeout(() => setSuccessToast(null), 5000);
        }
      } catch {
        // 轮询异常不中断，继续
      }
    }, 3000);
    setAlipayPollTimer(timer);
    // 5分钟后停止轮询
    setTimeout(() => {
      clearInterval(timer);
      setAlipayPolling(false);
    }, 300000);
  };

  const stopAlipayPolling = () => {
    if (alipayPollTimer) {
      clearInterval(alipayPollTimer);
      setAlipayPollTimer(null);
    }
    setAlipayPolling(false);
    setAlipayQRUrl(null);
  };

  const handleVerifyOrder = async () => {
    if (!currentOrder || !user) return;
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/recharge/verify-order', {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ order_id: currentOrder.id }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessToast(`充值成功！已到账 ${data.credits_added} 算力点`);
        setCurrentOrder(null);
        setSelectedPackage(null);
        refreshProfile();
        fetchTransactions(1);
        setTimeout(() => setSuccessToast(null), 5000);
      } else {
        alert(data.error || '核验失败，请确认已完成付款后重试');
      }
    } catch {
      alert('网络异常，请稍后重试');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleUploadQR = async () => {
    if (!uploadFile) {
      alert('请选择收款码图片');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('payment_method', uploadMethod);
      const res = await fetch('/api/upload/qrcode', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setShowQRUpload(false);
        setUploadFile(null);
        fetchQRCodes();
        alert('收款码上传成功!');
      } else {
        alert(data.error || '上传失败');
      }
    } catch {
      alert('上传失败');
    }
  };

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

      {/* QR Code Missing Alert */}
      {showNoQRAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 border-amber-500/30 bg-card shadow-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                <AlertCircle className="w-7 h-7 text-amber-400" />
              </div>
              <CardTitle className="text-xl text-amber-400">收款码未上传</CardTitle>
              <DialogDescription>
                请先上传你的微信商业收款码和支付宝商户收款码图片，上传完成后用户即可扫码付款
              </DialogDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!wechatQR?.file_url && (
                <Button
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => { setUploadMethod('wechat'); setShowQRUpload(true); }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  上传微信商业收款码
                </Button>
              )}
              {!alipayQR?.file_url && (
                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => { setUploadMethod('alipay'); setShowQRUpload(true); }}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  上传支付宝商户收款码
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={() => setShowNoQRAlert(false)}>
                稍后上传
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* QR Upload Dialog */}
      <Dialog open={showQRUpload} onOpenChange={setShowQRUpload}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              上传{uploadMethod === 'wechat' ? '微信商业收款码' : '支付宝商户收款码'}
            </DialogTitle>
            <DialogDescription>
              请选择{uploadMethod === 'wechat' ? '微信' : '支付宝'}收款码图片文件，上传后将在支付页面展示
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground">
              提示：请上传{uploadMethod === 'wechat' ? '微信商业收款码' : '支付宝商户收款码'}图片，支持 JPG/PNG 格式
            </p>
            <Button
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
              onClick={handleUploadQR}
              disabled={!uploadFile}
            >
              确认上传
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              activeTab === 'billing'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('billing')}
          >
            账单记录
          </button>
        </div>

        {/* 充值套餐 Tab */}
        {activeTab === 'recharge' && (
          <>
            {/* 套餐选择 */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-cyan-400" /> 算力充值
                </h2>
                <span className="text-xs text-muted-foreground">1元 = 10算力点 · 充值即到账 · 永久有效</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {creditPackages.map((pkg, idx) => {
                  const totalCredits = pkg.credits + (pkg.bonus_credits || 0);
                  const tag = PACKAGE_TAGS[idx] || '';
                  const isSelected = selectedPackage?.id === pkg.id;

                  return (
                    <Card
                      key={pkg.id}
                      className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 relative overflow-hidden group ${
                        isSelected
                          ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-500/5'
                          : 'border-border/50 hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5'
                      }`}
                      onClick={() => { setSelectedPackage(pkg); stopAlipayPolling(); setCurrentOrder(null); }}
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
                        {/* 选中指示 */}
                        {isSelected && (
                          <div className="mt-2">
                            <Check className="w-5 h-5 text-cyan-400 mx-auto" />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* 支付方式 + 订单操作 */}
            {selectedPackage && (
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-cyan-400" /> 选择支付方式
                </h2>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 支付通道卡片 */}
                  <div className="space-y-3">
                    {/* 微信支付 */}
                    <Card
                      className={`cursor-pointer transition-all ${
                        paymentMethod === 'wechat' ? 'border-green-500 ring-2 ring-green-500/20' : 'border-border/50'
                      }`}
                      onClick={() => setPaymentMethod('wechat')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center">
                              <QrCode className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">微信支付</p>
                              <p className="text-xs text-muted-foreground">微信扫码付款</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentMethod === 'wechat' ? 'border-green-500' : 'border-muted-foreground/30'
                          }`}>
                            {paymentMethod === 'wechat' && <div className="w-3 h-3 rounded-full bg-green-500" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 支付宝 */}
                    <Card
                      className={`cursor-pointer transition-all ${
                        paymentMethod === 'alipay' ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-border/50'
                      }`}
                      onClick={() => setPaymentMethod('alipay')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center">
                              <QrCode className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium">支付宝</p>
                              <p className="text-xs text-muted-foreground">在线扫码 · 自动到账</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            paymentMethod === 'alipay' ? 'border-blue-500' : 'border-muted-foreground/30'
                          }`}>
                            {paymentMethod === 'alipay' && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* 线下付款提示（仅微信） */}
                    {paymentMethod === 'wechat' && (
                    <Card className="border-amber-500/20 bg-amber-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                          <div className="text-sm text-amber-400/90">
                            <p className="font-medium">线下扫码付款</p>
                            <p className="text-xs mt-1 text-amber-400/70">
                              请使用微信扫描下方收款码完成付款，付款完成后点击「已付款，到账核验」按钮，系统将自动核对并发放算力点。
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    )}
                    {/* 支付宝在线支付提示 */}
                    {paymentMethod === 'alipay' && (
                    <Card className="border-blue-500/20 bg-blue-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <QrCode className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                          <div className="text-sm text-blue-400/90">
                            <p className="font-medium">支付宝在线支付</p>
                            <p className="text-xs mt-1 text-blue-400/70">
                              点击确认充值后，系统将生成支付宝当面付二维码，扫码支付后算力自动到账，无需手动核验。
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    )}
                  </div>

                  {/* 收款码展示 + 订单 */}
                  <div className="space-y-4">
                    {/* 支付宝在线支付二维码 */}
                    {paymentMethod === 'alipay' && alipayQRUrl ? (
                      <Card className="border-blue-500/30">
                        <CardContent className="p-5">
                          <p className="text-sm font-medium text-center mb-3 text-blue-400">
                            支付宝扫码付款
                          </p>
                          <div className="flex flex-col items-center">
                            <div className="relative w-52 h-52 border-2 border-dashed rounded-xl overflow-hidden border-blue-500/40 bg-white p-2">
                              <Image
                                src={alipayQRUrl}
                                alt="支付宝付款码"
                                fill
                                className="object-contain"
                              />
                            </div>
                            {alipayPolling && (
                              <div className="mt-3 flex items-center gap-2 text-blue-400 text-sm">
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                等待支付中...
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              打开支付宝扫一扫，支付后自动到账
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ) : paymentMethod === 'wechat' ? (
                    /* 微信收款码 */
                    <Card className="border-border/50">
                      <CardContent className="p-5">
                        <p className="text-sm font-medium text-center mb-3">
                          微信收款码
                        </p>
                        {wechatQR?.file_url ? (
                          <div className="flex flex-col items-center">
                            <div className="relative w-52 h-52 border-2 border-dashed rounded-xl overflow-hidden border-border/40 bg-white p-2">
                              <Image
                                src={wechatQR.file_url}
                                alt="微信收款码"
                                fill
                                className="object-contain"
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              打开微信扫一扫付款
                            </p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center py-8 text-center">
                            <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                            <p className="text-sm text-amber-400">收款码未上传</p>
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                setUploadMethod('wechat');
                                setShowQRUpload(true);
                              }}
                            >
                              <Upload className="w-3 h-3 mr-1" /> 上传收款码
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    ) : null}

                    {/* 订单确认 / 订单信息 */}
                    <Card className="border-border/50">
                      <CardContent className="p-5">
                        {!currentOrder ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">套餐</span>
                              <span className="font-medium">{selectedPackage.name}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">算力点</span>
                              <span className="font-medium text-cyan-400">
                                {selectedPackage.credits + (selectedPackage.bonus_credits || 0)} 点
                                {selectedPackage.bonus_credits > 0 && (
                                  <span className="text-emerald-400 text-xs ml-1">(含赠送{selectedPackage.bonus_credits}点)</span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">支付方式</span>
                              <span className="font-medium">{paymentMethod === 'wechat' ? '微信支付' : '支付宝在线支付'}</span>
                            </div>
                            <div className="pt-3 border-t border-border/30 flex items-center justify-between">
                              <span className="text-muted-foreground">应付金额</span>
                              <span className="text-2xl font-bold text-cyan-400">¥{selectedPackage.price}</span>
                            </div>
                            <Button
                              size="lg"
                              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium"
                              onClick={handleCreateOrder}
                              disabled={loading}
                            >
                              {loading ? '创建订单中...' : `确认充值 ¥${selectedPackage.price}`}
                            </Button>
                          </div>
                        ) : currentOrder.payment_method === 'alipay' ? (
                          /* 支付宝订单：显示订单信息+轮询状态 */
                          <div className="space-y-4">
                            <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                              <div className="flex items-center gap-2 text-sm mb-3">
                                <QrCode className="w-4 h-4 text-blue-400" />
                                <span className="text-blue-400 font-medium">支付宝在线支付</span>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-medium">1</span>
                                  <span className="text-muted-foreground pt-0.5">扫描上方支付宝二维码完成付款</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 font-medium">2</span>
                                  <span className="text-muted-foreground pt-0.5">支付成功后算力自动到账，无需手动操作</span>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>订单号: <span className="text-foreground font-mono">{currentOrder.order_no || currentOrder.id}</span></p>
                                <p>套餐: {currentOrder.package_name || selectedPackage?.name}</p>
                                <p>金额: <span className="text-cyan-400 font-medium">¥{currentOrder.amount}</span></p>
                                <p>算力: <span className="text-cyan-400 font-medium">{selectedPackage ? (selectedPackage.credits + (selectedPackage.bonus_credits || 0)) : '-'}点</span></p>
                                <p>支付方式: 支付宝在线支付</p>
                              </div>
                            </div>
                            {alipayPolling && (
                              <div className="flex items-center justify-center gap-2 text-blue-400 text-sm py-2">
                                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                等待支付中，支付成功后自动到账...
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-muted-foreground"
                              onClick={() => { stopAlipayPolling(); setCurrentOrder(null); }}
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" /> 返回重新选择
                            </Button>
                          </div>
                        ) : (
                          /* 微信订单：手动核验流程 */
                          <div className="space-y-4">
                            <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                              <div className="flex items-center gap-2 text-sm mb-3">
                                <Clock className="w-4 h-4 text-cyan-400" />
                                <span className="text-cyan-400 font-medium">请按以下步骤完成充值</span>
                              </div>
                              <div className="space-y-2 text-xs">
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-medium">1</span>
                                  <span className="text-muted-foreground pt-0.5">扫描上方微信收款码完成付款</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-medium">2</span>
                                  <span className="text-muted-foreground pt-0.5">付款完成后点击下方「已付款，到账核验」按钮</span>
                                </div>
                                <div className="flex items-start gap-2">
                                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-medium">3</span>
                                  <span className="text-muted-foreground pt-0.5">系统核验后算力自动到账</span>
                                </div>
                              </div>
                            </div>
                            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
                              <div className="space-y-1 text-xs text-muted-foreground">
                                <p>订单号: <span className="text-foreground font-mono">{currentOrder.order_no || currentOrder.id}</span></p>
                                <p>套餐: {currentOrder.package_name || selectedPackage?.name}</p>
                                <p>金额: <span className="text-cyan-400 font-medium">¥{currentOrder.amount}</span></p>
                                <p>算力: <span className="text-cyan-400 font-medium">{currentOrder.credits || currentOrder.credits_granted || selectedPackage ? (selectedPackage!.credits + (selectedPackage!.bonus_credits || 0)) : '-'}点</span></p>
                                <p>支付方式: 微信支付</p>
                              </div>
                            </div>
                            <Button
                              size="lg"
                              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium"
                              onClick={handleVerifyOrder}
                              disabled={verifyLoading}
                            >
                              {verifyLoading ? '核验中...' : '已付款，到账核验'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-muted-foreground"
                              onClick={() => { setCurrentOrder(null); }}
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" /> 返回重新选择
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </section>
            )}

            {/* 收款码管理 for Admin */}
            {profile?.is_admin && (
              <section className="mt-12 pt-8 border-t border-border/50">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Upload className="w-5 h-5 text-muted-foreground" /> 收款码管理（管理员）
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  上传或更换微信商业收款码、支付宝商户收款码图片，上传后即时生效
                </p>
                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                    onClick={() => { setUploadMethod('wechat'); setShowQRUpload(true); }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    上传微信收款码
                  </Button>
                  <Button
                    variant="outline"
                    className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                    onClick={() => { setUploadMethod('alipay'); setShowQRUpload(true); }}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    上传支付宝收款码
                  </Button>
                </div>
              </section>
            )}
          </>
        )}

        {/* 账单记录 Tab */}
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
