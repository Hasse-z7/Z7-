import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.COZE_SUPABASE_URL!,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY!
);

// GET: 搜索用户 /api/admin/recharge?phone=xxx 或 ?userId=xxx
export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    // 检查管理员权限（user.id 对应 profiles.user_id）
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, user_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');
    const userId = searchParams.get('userId');

    if (!phone && !userId) {
      return NextResponse.json({ error: '请提供手机号或用户ID' }, { status: 400 });
    }

    // 查询 auth.users 表获取手机号
    let targetUserId = userId;

    if (phone && !userId) {
      // 通过手机号查 auth.users
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
      if (authError) {
        return NextResponse.json({ error: '查询用户失败' }, { status: 500 });
      }

      const matchedUser = authUsers.users.find(u => {
        const userPhone = u.phone || u.user_metadata?.phone || u.user_metadata?.full_phone || '';
        return userPhone === phone || userPhone.endsWith(phone);
      });

      if (!matchedUser) {
        return NextResponse.json({ error: '未找到该手机号对应的用户' }, { status: 404 });
      }
      targetUserId = matchedUser.id;
    }

    // 查询 profiles 表获取算力信息（user_id 对应 auth.users.id）
    const { data: targetProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('user_id', targetUserId)
      .single();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: '未找到用户资料' }, { status: 404 });
    }

    // 查询 auth.users 获取邮箱和手机号
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(targetUserId!);

    // 查询最近10条算力流水
    const { data: transactions } = await supabaseAdmin
      .from('credits_transactions')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    // 查询最近10条订单
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      user: {
        id: targetUserId,
        email: authUser?.user?.email || '',
        phone: authUser?.user?.phone || authUser?.user?.user_metadata?.phone || '',
        display_name: targetProfile.display_name || authUser?.user?.user_metadata?.name || '',
        avatar_url: targetProfile.avatar_url || '',
        created_at: authUser?.user?.created_at || '',
      },
      profile: {
        credits: targetProfile.credits || 0,
        free_credits: targetProfile.free_credits || 0,
        paid_credits: targetProfile.paid_credits || 0,
        vip_level: targetProfile.vip_level || 0,
        is_admin: targetProfile.is_admin || false,
      },
      transactions: transactions || [],
      orders: orders || [],
    });
  } catch (err) {
    console.error('Admin recharge query error:', err);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

// POST: 管理员充值算力
export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    // 检查管理员权限（user.id 对应 profiles.user_id）
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin, user_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: '无管理员权限' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, amount, creditsType, description } = body;

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json({ error: '参数无效' }, { status: 400 });
    }

    if (amount > 100000) {
      return NextResponse.json({ error: '单次充值不能超过100000算力' }, { status: 400 });
    }

    const type = creditsType === 'free' ? 'free' : 'paid';
    const field = type === 'free' ? 'free_credits' : 'paid_credits';
    const desc = description || `管理员充值(${type === 'free' ? '免费' : '付费'}算力)`;

    // 原子更新算力
    const { data: updatedProfile, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        [field]: supabaseAdmin.rpc('add_credits', { row_id: userId, field_name: field, add_amount: amount }),
      })
      .eq('id', userId)
      .select()
      .single();

    // 如果 rpc 不可用，用读-改-写方式
    if (updateError) {
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select(field)
        .eq('id', userId)
        .single();

      if (!currentProfile) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }

      const newCredits = ((currentProfile as Record<string, unknown>)[field] as number || 0) + amount;

      const { error: writeError } = await supabaseAdmin
        .from('profiles')
        .update({ [field]: newCredits })
        .eq('id', userId);

      if (writeError) {
        return NextResponse.json({ error: '充值失败' }, { status: 500 });
      }

      // 记录流水
      await supabaseAdmin.from('credits_transactions').insert({
        user_id: userId,
        amount: amount,
        balance_after: newCredits,
        type: 'recharge',
        credits_type: type,
        description: desc,
      });

      return NextResponse.json({
        success: true,
        message: `成功充值${amount}算力`,
        new_balance: newCredits,
      });
    }

    // 记录流水
    await supabaseAdmin.from('credits_transactions').insert({
      user_id: userId,
      amount: amount,
      balance_after: updatedProfile?.[field] || 0,
      type: 'recharge',
      credits_type: type,
      description: desc,
    });

    return NextResponse.json({
      success: true,
      message: `成功充值${amount}算力`,
      new_balance: updatedProfile?.[field] || 0,
    });
  } catch (err) {
    console.error('Admin recharge error:', err);
    return NextResponse.json({ error: '充值失败' }, { status: 500 });
  }
}
