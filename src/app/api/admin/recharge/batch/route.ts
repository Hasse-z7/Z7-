import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const supabaseAdmin = createClient(
  process.env.COZE_SUPABASE_URL!,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!
);

// 赠送算力计算（与前端一致）
function calcBonusCredits(yuan: number): number {
  if (yuan >= 500) return Math.floor(yuan * 0.12);
  if (yuan >= 300) return Math.floor(yuan * 0.10);
  if (yuan >= 100) return Math.floor(yuan * 0.08);
  if (yuan >= 50) return Math.floor(yuan * 0.04);
  return 0;
}

// 计算 VIP 等级
function calcVipLevel(totalRecharged: number): string {
  if (totalRecharged >= 30000) return 'vip5';
  if (totalRecharged >= 10000) return 'vip4';
  if (totalRecharged >= 5000) return 'vip3';
  if (totalRecharged >= 2000) return 'vip2';
  if (totalRecharged >= 500) return 'vip1';
  return 'free';
}

function generateOrderNo(): string {
  const now = new Date();
  const ts = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `BAT${ts}${rand}`;
}

interface BatchItem {
  phone: string;
  amount_yuan: number;
  credits_type: 'free' | 'paid';
  description: string;
}

// POST: 批量充值 /api/admin/recharge/batch
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { items } = body as { items: BatchItem[] };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '无有效充值数据' }, { status: 400 });
    }

    if (items.length > 100) {
      return NextResponse.json({ error: '单次批量充值最多100条' }, { status: 400 });
    }

    // 获取所有 auth 用户，用于手机号匹配
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    if (authError) {
      return NextResponse.json({ error: '查询用户列表失败' }, { status: 500 });
    }

    // 构建手机号 -> userId 映射
    const phoneMap = new Map<string, string>();
    for (const u of authUsers.users) {
      const phone = u.phone || u.user_metadata?.phone || u.user_metadata?.full_phone || '';
      if (phone) {
        phoneMap.set(phone, u.id);
        // 也存去掉国家码的版本
        if (phone.startsWith('86') && phone.length > 5) {
          phoneMap.set(phone.slice(2), u.id);
        }
      }
    }

    const result = { success: 0, failed: 0, details: [] as string[] };

    for (const item of items) {
      try {
        // 匹配手机号
        const userId = phoneMap.get(item.phone) || phoneMap.get(`86${item.phone}`);
        if (!userId) {
          result.failed++;
          result.details.push(`❌ ${item.phone}: 未找到注册用户`);
          continue;
        }

        if (item.amount_yuan < 1) {
          result.failed++;
          result.details.push(`❌ ${item.phone}: 金额不能低于1元`);
          continue;
        }

        // 计算算力
        const baseCredits = Math.floor(item.amount_yuan * 10);
        const bonus = calcBonusCredits(item.amount_yuan);
        const totalCredits = baseCredits + bonus;
        const type = item.credits_type === 'free' ? 'free' : 'paid';
        const field = type === 'free' ? 'free_credits' : 'paid_credits';
        const desc = item.description || `批量充值(${type === 'free' ? '免费' : '付费'}算力，¥${item.amount_yuan})`;

        // 读取当前算力
        const { data: currentProfile } = await supabaseAdmin
          .from('profiles')
          .select('free_credits, paid_credits, credits, total_recharged')
          .eq('user_id', userId)
          .single();

        if (!currentProfile) {
          result.failed++;
          result.details.push(`❌ ${item.phone}: 用户资料不存在`);
          continue;
        }

        const currentFieldVal = (currentProfile as Record<string, unknown>)[field] as number || 0;
        const newFieldVal = currentFieldVal + totalCredits;
        const newFree = type === 'free' ? newFieldVal : (currentProfile.free_credits || 0);
        const newPaid = type === 'paid' ? newFieldVal : (currentProfile.paid_credits || 0);
        const newTotal = newFree + newPaid;
        const newTotalRecharged = (currentProfile.total_recharged || 0) + (type === 'paid' ? totalCredits : 0);
        const newVipLevel = calcVipLevel(newTotalRecharged);

        const { error: writeError } = await supabaseAdmin
          .from('profiles')
          .update({
            [field]: newFieldVal,
            credits: newTotal,
            total_recharged: newTotalRecharged,
            vip_level: newVipLevel,
          })
          .eq('user_id', userId);

        if (writeError) {
          result.failed++;
          result.details.push(`❌ ${item.phone}: 写入失败`);
          continue;
        }

        // 记录流水
        await supabaseAdmin.from('credits_transactions').insert({
          user_id: userId,
          amount: totalCredits,
          balance_after: newTotal,
          type: 'recharge',
          credits_type: type,
          description: desc,
        });

        // 创建订单记录
        const orderNo = generateOrderNo();
        await supabaseAdmin.from('orders').insert({
          id: randomUUID(),
          user_id: userId,
          order_no: orderNo,
          package_id: 0,
          package_name: `批量充值¥${item.amount_yuan}`,
          amount: item.amount_yuan,
          payment_method: 'admin_recharge',
          status: 'completed',
          credits_granted: totalCredits,
          vip_days_granted: 0,
          paid_at: new Date().toISOString(),
          verified_at: new Date().toISOString(),
        });

        result.success++;
        result.details.push(`✅ ${item.phone}: 充值${totalCredits}算力（¥${item.amount_yuan}${bonus > 0 ? `+赠${bonus}` : ''}）`);
      } catch {
        result.failed++;
        result.details.push(`❌ ${item.phone}: 处理异常`);
      }
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error('Batch recharge error:', err);
    return NextResponse.json({ error: '批量充值失败' }, { status: 500 });
  }
}
