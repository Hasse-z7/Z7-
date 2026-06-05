# AGENTS.md - 燃冬AI

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
│   │   ├── login/          # 登录页（手机验证码+邮箱密码Tab切换）
│   │   ├── register/       # 注册页（邮箱密码注册）
│   │   ├── forgot-password/ # 找回密码页
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
│   │       ├── auth/       # 认证API (login/register/profile/send-otp/verify-otp/reset-password)
│   │       ├── recharge/   # 充值API (packages/create-order/verify-order)
│   │       ├── ai/         # AI创作API (image/video/music)
│   │       │   └── video/ # 视频异步任务
│   │       │       ├── route.ts    # 提交任务(预扣算力)
│   │       │       ├── worker/     # Worker消费端(轮询方舟)
│   │       │       ├── status/     # 状态查询(前端轮询)
│   │       │       └── quota/      # 方舟额度监控(管理员)
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
│   │   ├── coze-api.ts     # Coze AI API封装(生图/音乐)
│   │   ├── ark-config.ts   # 方舟配置(Key池+熔断器)
│   │   ├── credits-helpers.ts # 算力管理(扣除/退还/记录)
│   │   ├── auth-helpers.ts # 认证辅助函数
│   │   ├── supabase-browser.ts # Supabase浏览器客户端(前端登录用)
│   │   ├── supabase-config-inject.tsx # Supabase配置注入Provider
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

- **profiles** - 用户资料（credits, free_credits, paid_credits, vip_level, is_admin）
- **recharge_packages** - 充值套餐（credits/vip类型，价格，算力，赠送算力）
- **orders** - 充值订单（order_no, amount, status, payment_method）
- **credits_transactions** - 算力流水（amount, balance_after, type, credits_type, description）
- **user_works** - 用户作品（work_type, file_url, prompt, credits_cost）
- **payment_qrcodes** - 收款码（wechat/alipay, image_url）
- **templates** - AI模板（category, sub_category, prompt_template, credits_cost, is_vip_only）
- **video_tasks** - 视频异步任务（status, ark_task_id, credits_cost, free_deducted, paid_deducted）
- **ark_usage_logs** - 方舟调用日志（action, tokens_consumed, api_key_index, 两套独立账单）

## 认证方案

- 后端：Supabase Auth（邮箱+密码、手机号+验证码），通过 `getSupabaseClient(token)` 验证
- 前端：API路由认证 + Supabase浏览器客户端（手机验证码登录用SDK直连）
- 前端配置注入：`SupabaseConfigProvider` → `supabase-browser.ts`（通过 `/api/supabase-config` 获取凭证）
- 辅助函数：`getAuthUser(request)` 统一从Cookie/Header获取用户
- 登录方式：手机验证码（登录注册一体）+ 邮箱密码（独立注册页）+ 找回密码
- API路由：
  - `/api/auth/login` - 邮箱密码登录
  - `/api/auth/register` - 邮箱注册
  - `/api/auth/send-otp` - 发送手机验证码
  - `/api/auth/verify-otp` - 验证手机验证码（登录注册一体）
  - `/api/auth/reset-password` - 找回密码（发送重置邮件）
  - `/api/auth/profile` - 获取用户信息
  - `/api/supabase-config` - 前端获取Supabase凭证

## AI创作算力消耗

| 功能 | 算力消耗 | 说明 |
|------|---------|------|
| AI生图 | 2算力点/张 | 按生成张数计费，模型由前端下拉选择 |
| AI视频 | 3算力点/秒 | 按视频时长计费，模型由前端下拉选择 |
| AI音乐 | 10算力点/首 | 固定消耗 |

## AI模型管理

- 数据库表：`ai_models`（name, endpoint_id, category, is_active, sort_order, description）
- 管理后台：`/admin` 模型Tab页，支持CRUD操作
- 前端生图/生视频页面自动加载对应category的模型列表，用户下拉选择
- 模型Endpoint ID透传到后端，后端校验数据库中模型是否存在且active
- 默认模型：视频=Seedance 1.5 Pro (doubao-seedance-1-5-pro-251215)，图片=Seedream 5.0 (doubao-seedream-5-0-260128)
- 图片模型：Seedream 5.0（平台 integration.coze.cn 端点，doubao-seed 系列在该端点不可用）
- 视频模型：Seedance 1.5 Pro（平台 integration.coze.cn 端点）

## 算力规则

- 单位：算力点，1元=10算力点
- 永久有效，不清零
- 新用户注册赠送已取消
- 每日登录赠送已取消
- 充值到账写入 paid_credits
- 优先消耗免费算力(free_credits)，再消耗付费算力(paid_credits)

## 并发与容量规划

- 并发控制：`src/lib/rate-limiter.ts`（槽位控制 + 速率限制 + 排队 + 多Key轮转）
- 当前方案：5 DMXAPI Key（支持30-50人同时在线）
- 环境变量 `DMXAPI_API_KEYS`：逗号分隔多组Key，当前5个，自动轮转负载均衡
- 环境变量 `ARK_API_KEYS`：逗号分隔多组Key，视频生成用
- 最大并发槽位：50（匹配5 DMXAPI Key + 1 Coze Key吞吐上限）
- 全局速率限制：300 RPM
- 单用户速率限制：15 RPM（防止单用户占满并发）
- 槽位超时：3分钟自动释放
- 排队超时：90秒
- Key故障：单个Key连续失败5次自动禁用，恢复后自动启用
- 扩容方式：增加DMXAPI/ARK Key数量，代码已支持多Key轮转，只需改环境变量
- 扩容升级：100+人同时在线需8-10个DMXAPI Key + 5-6个ARK Key

## 火山方舟视频生成架构

- 配置：`src/lib/ark-config.ts`（API Key池 + 负载均衡 + 熔断器）
- 客户端：`src/lib/ark-client.ts`（提交任务 + 查询状态 + 重试 + Key轮转）
- 固定模型接入点：`ark-45c3d43e-bbd4-48ef-b995-4f156a2c1967-31b72`
- 请求域名：`https://ark.cn-beijing.volces.com/api/v3`
- 环境变量 `ARK_API_KEYS`：逗号分隔多组Key，自动负载均衡切换
- 异步流程：提交→预扣算力→创建任务→Worker消费→轮询方舟→成功锁定/失败退还
- 熔断：1分钟内失败率超30%暂停接收新任务，60秒后半开
- 重试：5xx/429指数退避最多3次，参数错误/密钥失效不重试
- 独立账单：ark_usage_logs记录方舟调用消耗，credits_transactions记录用户算力

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
