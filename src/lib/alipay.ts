/**
 * 支付宝当面付集成工具库
 *
 * 功能：
 * 1. RSA2签名/验签（SHA256WithRSA）
 * 2. 当面付下单（alipay.trade.precreate）
 * 3. 主动查单（alipay.trade.query）
 * 4. 异步通知验签
 *
 * 环境变量：
 * - ALIPAY_APP_ID: 应用ID
 * - ALIPAY_PRIVATE_KEY: 应用私钥（PKCS1/PKCS8格式，去除头尾和换行）
 * - ALIPAY_PUBLIC_KEY: 支付宝公钥（去除头尾和换行）
 * - ALIPAY_NOTIFY_URL: 异步通知地址（公网可访问）
 */

import crypto from 'crypto';

// ==================== 配置 ====================

function getConfig() {
  return {
    appId: process.env.ALIPAY_APP_ID || '',
    privateKey: (process.env.ALIPAY_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim(),
    alipayPublicKey: (process.env.ALIPAY_ALIPAY_PUBLIC_KEY || '').replace(/\\n/g, '\n').trim(),
    notifyUrl: process.env.ALIPAY_NOTIFY_URL || '',
    gateway: process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
    charset: 'utf-8',
    signType: 'RSA2',
    version: '1.0',
  };
}

// ==================== RSA2 签名 ====================

/**
 * RSA2签名（SHA256WithRSA）
 * 用应用私钥对请求参数签名
 */
export function sign(content: string, privateKey: string): string {
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(content, 'utf8');
  // 支付宝要求Base64编码的签名
  return sign.sign(formatPrivateKey(privateKey), 'base64');
}

/**
 * RSA2验签（SHA256WithRSA）
 * 用支付宝公钥验证回调数据的签名
 */
export function verify(content: string, signature: string, publicKey: string): boolean {
  try {
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(content, 'utf8');
    return verify.verify(formatPublicKey(publicKey), signature, 'base64');
  } catch {
    return false;
  }
}

// ==================== 密钥格式化 ====================

/**
 * 格式化私钥（补齐PEM头尾）
 */
function formatPrivateKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
}

/**
 * 格式化公钥（补齐PEM头尾）
 */
function formatPublicKey(key: string): string {
  if (key.includes('-----BEGIN')) return key;
  return `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
}

// ==================== 请求参数构建 ====================

/**
 * 构建签名内容（按key排序拼接）
 * 排除 sign 和 sign_type 字段
 */
export function buildSignContent(params: Record<string, string>): string {
  return Object.keys(params)
    .filter(key => key !== 'sign' && key !== 'sign_type' && params[key] !== '')
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
}

/**
 * 构建完整请求参数（含签名）
 */
function buildRequestParams(bizContent: Record<string, unknown>, method: string): Record<string, string> {
  const config = getConfig();
  const params: Record<string, string> = {
    app_id: config.appId,
    method,
    charset: config.charset,
    sign_type: config.signType,
    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), // yyyy-MM-dd HH:mm:ss
    version: config.version,
    biz_content: JSON.stringify(bizContent),
  };

  if (config.notifyUrl) {
    params.notify_url = config.notifyUrl;
  }

  // 签名
  const signContent = buildSignContent(params);
  params.sign = sign(signContent, config.privateKey);

  return params;
}

// ==================== API 调用 ====================

interface AlipayResponse {
  code: string;
  msg: string;
  [key: string]: unknown;
}

/**
 * 调用支付宝网关
 */
async function callAlipay(params: Record<string, string>): Promise<AlipayResponse> {
  const config = getConfig();
  const url = `${config.gateway}?${new URLSearchParams(params).toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const text = await response.text();

  try {
    // 支付宝返回格式: {"alipay_trade_precreate_response":{...},"sign":"...","sign_type":"RSA2"}
    const data = JSON.parse(text);

    // 提取业务响应（方法名转下划线格式）
    const methodKey = params.method.replace(/\./g, '_') + '_response';
    const bizResponse = data[methodKey];

    if (!bizResponse) {
      return { code: 'FORMAT_ERROR', msg: `响应格式错误: ${text.substring(0, 200)}` };
    }

    // 验证响应签名（防篡改）
    if (data.sign) {
      const signContent = buildSignContent(bizResponse as Record<string, string>);
      const isValid = verify(signContent, data.sign, config.alipayPublicKey);
      if (!isValid) {
        return { code: 'SIGN_ERROR', msg: '响应签名验证失败' };
      }
    }

    return bizResponse as AlipayResponse;
  } catch {
    return { code: 'PARSE_ERROR', msg: `解析响应失败: ${text.substring(0, 200)}` };
  }
}

// ==================== 当面付下单 ====================

export interface PrecreateResult {
  success: boolean;
  qr_code?: string;       // 支付宝二维码链接
  out_trade_no?: string;   // 商户订单号
  trade_no?: string;       // 支付宝交易号
  error?: string;
}

/**
 * 当面付下单（alipay.trade.precreate）
 * 生成二维码链接，用户扫码支付
 */
export async function precreate(params: {
  outTradeNo: string;
  totalAmount: string;     // 单位：元，如 "10.00"
  subject: string;         // 订单标题
  timeoutExpress?: string; // 超时时间，如 "30m"
}): Promise<PrecreateResult> {
  const bizContent: Record<string, unknown> = {
    out_trade_no: params.outTradeNo,
    total_amount: params.totalAmount,
    subject: params.subject,
    timeout_express: params.timeoutExpress || '30m',
  };

  const requestParams = buildRequestParams(bizContent, 'alipay.trade.precreate');
  const result = await callAlipay(requestParams);

  if (result.code === '10000') {
    return {
      success: true,
      qr_code: result.qr_code as string,
      out_trade_no: result.out_trade_no as string,
      trade_no: result.trade_no as string,
    };
  }

  return {
    success: false,
    error: (result.sub_msg || result.msg || '下单失败') as string,
  };
}

// ==================== 主动查单 ====================

export interface QueryResult {
  success: boolean;
  trade_status?: string;  // TRADE_SUCCESS / TRADE_FINISHED / WAIT_BUYER_PAY / TRADE_CLOSED
  trade_no?: string;      // 支付宝交易号
  out_trade_no?: string;  // 商户订单号
  total_amount?: string;  // 实付金额
  buyer_user_id?: string; // 买家ID
  error?: string;
}

/**
 * 主动查询交易状态（alipay.trade.query）
 * 用于前端轮询或后端兜底校验
 */
export async function tradeQuery(params: {
  outTradeNo?: string;
  tradeNo?: string;
}): Promise<QueryResult> {
  const bizContent: Record<string, unknown> = {};
  if (params.outTradeNo) bizContent.out_trade_no = params.outTradeNo;
  if (params.tradeNo) bizContent.trade_no = params.tradeNo;

  if (!params.outTradeNo && !params.tradeNo) {
    return { success: false, error: '缺少订单号' };
  }

  const requestParams = buildRequestParams(bizContent, 'alipay.trade.query');
  const result = await callAlipay(requestParams);

  if (result.code === '10000') {
    return {
      success: true,
      trade_status: result.trade_status as string,
      trade_no: result.trade_no as string,
      out_trade_no: result.out_trade_no as string,
      total_amount: result.total_amount as string,
      buyer_user_id: result.buyer_user_id as string,
    };
  }

  if (result.code === '40004') {
    // 交易不存在
    return {
      success: true,
      trade_status: 'NOT_EXIST',
      error: (result.sub_msg || '交易不存在') as string,
    };
  }

  return {
    success: false,
    error: (result.sub_msg || result.msg || '查询失败') as string,
  };
}

// ==================== 异步通知验签 ====================

/**
 * 验证支付宝异步通知签名
 *
 * 步骤：
 * 1. 从通知参数中取出 sign 和 sign_type
 * 2. 对剩余参数按key排序拼接成签名内容
 * 3. 用支付宝公钥验签（RSA2）
 *
 * @param notifyParams - 支付宝POST过来的所有参数
 * @returns 验签是否通过
 */
export function verifyNotifySign(notifyParams: Record<string, string>): boolean {
  const config = getConfig();
  const signValue = notifyParams.sign;
  const signType = notifyParams.sign_type;

  if (!signValue || signType !== 'RSA2') {
    return false;
  }

  // 构建签名内容（排除sign和sign_type）
  const signContent = buildSignContent(notifyParams);

  // 用支付宝公钥验签
  return verify(signContent, signValue, config.alipayPublicKey);
}
