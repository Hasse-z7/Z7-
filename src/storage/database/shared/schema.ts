import { pgTable, serial, varchar, timestamp, boolean, integer, numeric, text, index, uuid, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 用户资料表 - 扩展 Supabase Auth
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
  nickname: varchar("nickname", { length: 50 }).default(''),
  avatar_url: varchar("avatar_url", { length: 500 }).default(''),
  phone: varchar("phone", { length: 20 }).default(''),
  credits: integer("credits").notNull().default(10),
  vip_level: varchar("vip_level", { length: 20 }).notNull().default('free'),
  vip_expire_at: timestamp("vip_expire_at", { withTimezone: true }),
  is_admin: boolean("is_admin").notNull().default(false),
  daily_image_count: integer("daily_image_count").notNull().default(0),
  daily_video_count: integer("daily_video_count").notNull().default(0),
  daily_music_count: integer("daily_music_count").notNull().default(0),
  daily_digital_count: integer("daily_digital_count").notNull().default(0),
  daily_reset_at: timestamp("daily_reset_at", { withTimezone: true }).default(sql`now()`),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("profiles_user_id_idx").on(table.user_id),
  index("profiles_phone_idx").on(table.phone),
]);

// 充值套餐配置表
export const recharge_packages = pgTable("recharge_packages", {
  id: serial().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default('credits'), // credits / vip_month / vip_quarter / vip_year
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  credits: integer("credits").notNull().default(0), // 赠送算力
  bonus_credits: integer("bonus_credits").notNull().default(0), // 额外赠送
  duration_days: integer("duration_days").default(0), // VIP天数
  is_first_charge_bonus: boolean("is_first_charge_bonus").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("recharge_packages_type_idx").on(table.type),
  index("recharge_packages_active_idx").on(table.is_active),
]);

// 充值订单表
export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
  package_id: integer("package_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  payment_method: varchar("payment_method", { length: 20 }).notNull(), // wechat / alipay
  status: varchar("status", { length: 20 }).notNull().default('pending'), // pending / paid / verified / failed
  credits_granted: integer("credits_granted").notNull().default(0),
  vip_days_granted: integer("vip_days_granted").notNull().default(0),
  paid_at: timestamp("paid_at", { withTimezone: true }),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("orders_user_id_idx").on(table.user_id),
  index("orders_status_idx").on(table.status),
  index("orders_created_at_idx").on(table.created_at),
]);

// 算力交易流水表
export const credits_transactions = pgTable("credits_transactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
  amount: integer("amount").notNull(), // 正数=充入，负数=消耗
  balance_after: integer("balance_after").notNull(),
  type: varchar("type", { length: 30 }).notNull(), // recharge / consume_image / consume_video / consume_music / consume_digital / vip_bonus / register_bonus
  description: varchar("description", { length: 200 }).default(''),
  related_id: varchar("related_id", { length: 36 }).default(''), // 关联的order_id或work_id
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("credits_transactions_user_id_idx").on(table.user_id),
  index("credits_transactions_type_idx").on(table.type),
  index("credits_transactions_created_at_idx").on(table.created_at),
]);

// 用户作品表
export const user_works = pgTable("user_works", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
  type: varchar("type", { length: 20 }).notNull(), // image / video / music / digital_human
  title: varchar("title", { length: 200 }).default(''),
  prompt: text("prompt").default(''),
  file_url: varchar("file_url", { length: 1000 }).notNull(),
  file_key: varchar("file_key", { length: 500 }).default(''),
  thumbnail_url: varchar("thumbnail_url", { length: 1000 }).default(''),
  metadata: jsonb("metadata").default({}),
  credits_cost: integer("credits_cost").notNull().default(0),
  is_deleted: boolean("is_deleted").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("user_works_user_id_idx").on(table.user_id),
  index("user_works_type_idx").on(table.type),
  index("user_works_created_at_idx").on(table.created_at),
]);

// 收款码配置表
export const payment_qrcodes = pgTable("payment_qrcodes", {
  id: serial().primaryKey(),
  type: varchar("type", { length: 20 }).notNull().unique(), // wechat / alipay
  file_key: varchar("file_key", { length: 500 }).notNull(),
  file_url: varchar("file_url", { length: 1000 }).notNull(),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// AI创作模板表
export const templates = pgTable("templates", {
  id: serial().primaryKey(),
  category: varchar("category", { length: 30 }).notNull(), // image / video / music / digital_human
  sub_category: varchar("sub_category", { length: 50 }).notNull(), // realistic / anime / guofeng / cyberpunk etc.
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 300 }).default(''),
  thumbnail_url: varchar("thumbnail_url", { length: 1000 }).default(''),
  prompt_template: text("prompt_template").notNull(),
  model_config: jsonb("model_config").default({}),
  credits_cost: integer("credits_cost").notNull().default(1),
  is_vip_only: boolean("is_vip_only").notNull().default(false),
  is_active: boolean("is_active").notNull().default(true),
  sort_order: integer("sort_order").notNull().default(0),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("templates_category_idx").on(table.category),
  index("templates_sub_category_idx").on(table.sub_category),
]);
