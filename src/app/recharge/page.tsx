'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Zap, Crown, Gift, Check, CreditCard, QrCode, Upload, AlertCircle
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
  payment_method: string;
  status: string;
}

export default function RechargePage() {
  const { profile, user } = useAuth();
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
        setQrcodes(data.qricodes || data.qrcodes);
        // Check if both QR codes exist
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

  useEffect(() => {
    fetchPackages();
    fetchQRCodes();
  }, [fetchPackages, fetchQRCodes]);

  const wechatQR = qrcodes.find(q => q.type === 'wechat');
  const alipayQR = qrcodes.find(q => q.type === 'alipay');

  const handleCreateOrder = async () => {
    if (!selectedPackage || !user) return;
    setLoading(true);
    try {
      const res = await fetch('/api/recharge/create-order', { credentials: 'include',
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
        alert(data.error || '创建订单失败');
      }
    } catch {
      alert('创建订单失败');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOrder = async () => {
    if (!currentOrder || !user) return;
    setVerifyLoading(true);
    try {
      const res = await fetch('/api/recharge/verify-order', { credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ order_id: currentOrder.id }),
      });
      const data = await res.json();
      if (data.message) {
        alert(data.message);
        setCurrentOrder(null);
        setSelectedPackage(null);
      } else {
        alert(data.error || '核验失败');
      }
    } catch {
      alert('核验失败');
    } finally {
      setVerifyLoading(false);
    }
  };

  const [uploadFile, setUploadFile] = useState<File | null>(null);

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

  const creditPackages = packages.filter(p => p.type === 'credits');
  const vipPackages = packages.filter(p => p.type.startsWith('vip_'));

  return (
    <div className="min-h-screen bg-background">
      {/* QR Code Missing Alert */}
      {showNoQRAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <Card className="w-full max-w-md mx-4 border-amber-500/30 bg-card shadow-2xl">
            <CardHeader className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
                <AlertCircle className="w-7 h-7 text-amber-400" />
              </div>
              <CardTitle className="text-xl text-amber-400">收款码未上传</CardTitle>
              <CardDescription>
                请先上传你的微信商业收款码和支付宝商户收款码图片，上传完成后用户即可扫码付款
              </CardDescription>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            充值中心
          </h1>
          <p className="text-muted-foreground mt-2">选择充值套餐，扫码付款即时到账</p>
          {profile && (
            <div className="flex items-center gap-4 mt-4">
              <Badge variant="outline" className="text-cyan-400 border-cyan-400/30">
                <Zap className="w-3 h-3 mr-1" /> 算力: {profile.credits}
              </Badge>
              <Badge variant="outline" className="text-amber-400 border-amber-400/30">
                <Crown className="w-3 h-3 mr-1" /> {profile.vip_level === 'free' ? '免费用户' : 'VIP会员'}
              </Badge>
            </div>
          )}
        </div>

        {/* Credits Packages */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-cyan-400" /> 算力充值
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {creditPackages.map((pkg) => (
              <Card
                key={pkg.id}
                className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
                  selectedPackage?.id === pkg.id
                    ? 'border-cyan-500 ring-2 ring-cyan-500/30 bg-cyan-500/5'
                    : 'border-border/50 hover:border-cyan-500/30'
                }`}
                onClick={() => { setSelectedPackage(pkg); setCurrentOrder(null); }}
              >
                <CardContent className="p-4 text-center">
                  {pkg.is_first_charge_bonus && (
                    <Badge className="mb-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs">
                      <Gift className="w-3 h-3 mr-1" /> 首充加赠
                    </Badge>
                  )}
                  <p className="text-2xl font-bold text-cyan-400">¥{pkg.price}</p>
                  <p className="text-sm font-medium mt-1">{pkg.credits} 算力</p>
                  {pkg.bonus_credits > 0 && (
                    <p className="text-xs text-green-400 mt-1">+赠送{pkg.bonus_credits}算力</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* VIP Packages */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-400" /> VIP会员
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {vipPackages.map((pkg) => (
              <Card
                key={pkg.id}
                className={`cursor-pointer transition-all duration-300 hover:-translate-y-1 relative overflow-hidden ${
                  selectedPackage?.id === pkg.id
                    ? 'border-amber-500 ring-2 ring-amber-500/30 bg-amber-500/5'
                    : 'border-border/50 hover:border-amber-500/30'
                }`}
                onClick={() => { setSelectedPackage(pkg); setCurrentOrder(null); }}
              >
                {pkg.type === 'vip_year' && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-3 py-1 rounded-bl-lg font-medium">
                    最受欢迎
                  </div>
                )}
                <CardContent className="p-6 text-center">
                  <Crown className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-lg font-bold">{pkg.name}</p>
                  <p className="text-3xl font-bold text-amber-400 mt-2">¥{pkg.price}</p>
                  <p className="text-sm text-muted-foreground mt-1">{pkg.duration_days}天会员 + {pkg.credits}算力</p>
                  <ul className="mt-3 text-xs text-muted-foreground space-y-1 text-left">
                    <li className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> 高清图/长视频特权</li>
                    <li className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> 专业数字人模板</li>
                    <li className="flex items-center gap-1"><Check className="w-3 h-3 text-green-400" /> 每日创作次数翻倍</li>
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Payment Section */}
        {selectedPackage && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-cyan-400" /> 选择支付方式
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* WeChat Pay */}
              <Card className={`cursor-pointer transition-all ${
                paymentMethod === 'wechat' ? 'border-green-500 ring-2 ring-green-500/30' : 'border-border/50'
              }`} onClick={() => setPaymentMethod('wechat')}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-white" />
                    </div>
                    微信支付
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {wechatQR?.file_url ? (
                    <div className="flex flex-col items-center">
                      <div className="relative w-48 h-48 border-2 border-green-500/20 rounded-lg overflow-hidden">
                        <Image src={wechatQR.file_url} alt="微信收款码" fill className="object-contain" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">打开微信扫一扫付款</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 text-center">
                      <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                      <p className="text-sm text-amber-400">微信收款码未上传</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 border-green-500/30 text-green-400 hover:bg-green-500/10"
                        onClick={(e) => { e.stopPropagation(); setUploadMethod('wechat'); setShowQRUpload(true); }}
                      >
                        <Upload className="w-3 h-3 mr-1" /> 上传收款码
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Alipay */}
              <Card className={`cursor-pointer transition-all ${
                paymentMethod === 'alipay' ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-border/50'
              }`} onClick={() => setPaymentMethod('alipay')}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                      <QrCode className="w-5 h-5 text-white" />
                    </div>
                    支付宝
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {alipayQR?.file_url ? (
                    <div className="flex flex-col items-center">
                      <div className="relative w-48 h-48 border-2 border-blue-500/20 rounded-lg overflow-hidden">
                        <Image src={alipayQR.file_url} alt="支付宝收款码" fill className="object-contain" />
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">打开支付宝扫一扫付款</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-8 text-center">
                      <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
                      <p className="text-sm text-amber-400">支付宝收款码未上传</p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                        onClick={(e) => { e.stopPropagation(); setUploadMethod('alipay'); setShowQRUpload(true); }}
                      >
                        <Upload className="w-3 h-3 mr-1" /> 上传收款码
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Order Action */}
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4">
              {!currentOrder ? (
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium px-8"
                  onClick={handleCreateOrder}
                  disabled={loading}
                >
                  {loading ? '创建订单中...' : `确认充值 ¥${selectedPackage.price}`}
                </Button>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-lg bg-card border border-border">
                  <div>
                    <p className="font-medium">订单号: {currentOrder.order_no}</p>
                    <p className="text-sm text-muted-foreground">
                      {currentOrder.package_name} - ¥{currentOrder.amount}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      支付方式: {currentOrder.payment_method === 'wechat' ? '微信' : '支付宝'}
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium"
                    onClick={handleVerifyOrder}
                    disabled={verifyLoading}
                  >
                    {verifyLoading ? '核验中...' : '已付款，到账核验'}
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                付款完成后点击「已付款，到账核验」，系统将自动核对订单并发放算力
              </p>
            </div>
          </section>
        )}

        {/* QR Code Management for Admin */}
        <section className="mt-12 pt-8 border-t border-border/50">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-muted-foreground" /> 收款码管理
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
      </div>
    </div>
  );
}
