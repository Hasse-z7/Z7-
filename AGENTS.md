# AGENTS.md - AI创意工坊

## 项目概览

商业化AI多媒体创作网站，支持用户注册登录、算力充值（微信/支付宝双收款码）、会员管理，以及四大AI创作功能：AI生图、AI视频生成、AI音乐制作、AI数字人视频。内置管理员后台。

## 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + Auth + Storage)
- **AI SDK**: coze-coding-dev-sdk (Image, Video, TTS)
- **Theme**: next-themes (dark/light)

## 目录结构

```
├── public/                 # 静态资源
├── src/
│   ├── app/                # 页面路由
│   │   ├── page.tsx        # 首页
│   │   ├── layout.tsx      # 全局Layout
│   │   ├── globals.css     # 全局样式
│   │   ├── login/          # 登录页
│   │   ├── register/       # 注册页
│   │   ├── dashboard/      # 个人中心
│   │   ├── recharge/       # 充值中心
│   │   ├── create/         # AI创作页
│   │   │   ├── image/      # AI生图
│   │   │   ├── video/      # AI视频
│   │   │   ├── music/      # AI音乐
│   │   │   └── digital-human/ # AI数字人
│   │   ├── my-works/       # 我的作品
│   │   ├── membership/     # 会员权益
│   │   ├── admin/          # 管理后台
│   │   └── api/            # API路由
│   │       ├── auth/       # 认证API (login/register/profile)
│   │       ├── recharge/   # 充值API (packages/create-order/verify-order)
│   │       ├── ai/         # AI创作API (image/video/music/digital-human)
│   │       ├── qrcodes/    # 收款码API
│   │       ├── templates/  # 模板API
│   │       ├── orders/     # 订单API
│   │       ├── works/      # 作品API
│   │       └── admin/      # 管理API
│   ├── components/         # 组件
│   │   ├── ui/             # shadcn/ui组件
│   │   ├── navbar.tsx      # 顶部导航
│   │   ├── footer.tsx      # 底部信息栏
│   │   └── theme-provider.tsx
│   ├── contexts/           # React上下文
│   │   └── auth-context.tsx  # 认证上下文（API路由认证）
│   ├── lib/                # 工具库
│   │   ├── coze-api.ts     # Coze AI API封装
│   │   ├── auth-helpers.ts # 认证辅助函数
│   │   ├── supabase-browser.ts # Supabase浏览器客户端
│   │   └── utils.ts        # 通用工具
│   ├── hooks/              # 自定义Hooks
│   └── storage/            # Supabase存储层
│       └── database/       # 数据库客户端+Schema
├── DESIGN.md               # 设计规范
└── AGENTS.md               # 本文件
```

## 构建和测试命令

```bash
pnpm install           # 安装依赖
pnpm dev               # 开发模式（端口5000）
pnpm build             # 生产构建
pnpm start             # 生产运行
pnpm lint              # ESLint检查
pnpm ts-check          # TypeScript类型检查
```

## 数据库表结构

- **profiles** - 用户资料（credits, vip_level, daily_xxx_count, is_admin）
- **recharge_packages** - 充值套餐（credits/vip类型，价格，算力，赠送算力）
- **orders** - 充值订单（order_no, amount, status, payment_method）
- **credits_transactions** - 算力流水（amount, balance_after, type, description）
- **user_works** - 用户作品（work_type, file_url, prompt, credits_cost）
- **payment_qrcodes** - 收款码（wechat/alipay, image_url）
- **templates** - AI模板（category, sub_category, prompt_template, credits_cost, is_vip_only）

## 认证方案

- 后端：Supabase Auth（邮箱+密码），通过 `getSupabaseClient(token)` 验证
- 前端：API路由认证，Cookie存储 `sb-access-token` 和 `sb-refresh-token`
- 辅助函数：`getAuthUser(request)` 统一从Cookie/Header获取用户

## AI创作算力消耗

| 功能 | 算力消耗 | 说明 |
|------|---------|------|
| AI生图 | 2算力点/张 | 按生成张数计费 |
| AI视频 | 3算力点/秒 | 按视频时长计费，MP3不额外扣费 |
| AI音乐 | 10算力点/首 | 固定消耗 |

## 算力规则

- 单位：算力点，1元=10算力点
- 永久有效，不清零
- 新用户注册赠送50算力点
- 每日登录赠送5算力点（跨天首次访问自动发放）

## 充值套餐

| 套餐 | 价格 | 算力 | 赠送 | 合计 |
|------|------|------|------|------|
| 体验套餐 | ¥10 | 100 | 0 | 100 |
| 基础套餐 | ¥50 | 500 | 20 | 520 |
| 进阶套餐 | ¥100 | 1000 | 80 | 1080 |
| 专业套餐 | ¥300 | 3000 | 300 | 3300 |
| 尊享套餐 | ¥500 | 5000 | 600 | 5600 |

## 代码风格指南

- TypeScript strict模式，禁止隐式any
- 使用shadcn/ui组件，遵循Radix UI规范
- CSS使用Tailwind CSS 4 utility类
- API路由统一使用 `NextRequest/NextResponse`
- 客户端组件标记 'use client'
- 认证API使用 `getAuthUser(request)` 获取用户

## 收款码上传流程

1. 管理员访问充值页面
2. 页面检测payment_qrcodes表无数据时弹出上传提示
3. 上传微信/支付宝收款码图片到Supabase Storage
4. 保存URL到payment_qrcodes表
5. 用户访问充值页面时展示对应二维码
