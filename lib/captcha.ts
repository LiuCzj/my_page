/** 图形验证码：生成 + 校验。 */

import { randomBytes } from 'node:crypto';
import svgCaptcha from 'svg-captcha';

/** 校验结果。分四种是为了让前端能给出不同的下一步动作 */
export type CaptchaVerdict = 'ok' | 'expired' | 'invalid' | 'too_many';

/** 有效期：5 分钟。够用户读完输入，又不至于留一个长期可用的入口 */
const TTL_MS = 5 * 60 * 1000;

/** 同一枚验证码最多被试几次，超过即作废 */
const MAX_ATTEMPTS = 5;

/** 内存里最多同时存多少枚。 */
const MAX_ENTRIES = 500;

/** 字符集：5 位，长度固定 */
const CAPTCHA_SIZE = 5;

interface Entry {
  /** 答案，已归一化为小写 */
  answer: string;
  expiresAt: number;
  attempts: number;
}

/** id → 条目。id 是随机 16 字节的十六进制，不可猜 */
const store = new Map<string, Entry>();

/**
 * 清掉过期条目；仍超上限时再按插入顺序丢最早的。
 * @param now 当前时间戳
 */
function sweep(now: number): void {
  for (const [id, entry] of store) {
    if (entry.expiresAt <= now) store.delete(id);
  }
  const overflow = store.size - MAX_ENTRIES;
  if (overflow <= 0) return;
  let dropped = 0;
  for (const id of store.keys()) {
    store.delete(id);
    if (++dropped >= overflow) break;
  }
}

/**
 * 生成一枚新的图形验证码。
 * @returns `id` 交给前端随表单回传；`svg` 是可直接内联到页面的 SVG 字符串
 */
export function createCaptcha(): { id: string; svg: string } {
  const now = Date.now();
  sweep(now);

  const captcha = svgCaptcha.create({
    size: CAPTCHA_SIZE,
    /* 排掉易混字符：0 与 o、1 与 l 与 I。 */
    ignoreChars: '0o1ilI',
    /* ── 下面这几个数是量出来的，别凭感觉调 ── */
    width: 200,
    height: 60,
    fontSize: 60,
    /** 干扰线 1 条。2 条以上会把字面切碎（实测过），1 条足够让 OCR 不好受 */
    noise: 1,
    /** 近黑色字符。注意：这一项只有在不设 background 时才生效，见上面的说明 */
    color: false,
  });

  const id = randomBytes(16).toString('hex');
  store.set(id, { answer: captcha.text.toLowerCase(), expiresAt: now + TTL_MS, attempts: 0 });

  return { id, svg: captcha.data };
}

/**
 * 校验一枚图形验证码。
 * @param id 生成时返回的 id
 * @param input 用户填的字符
 * @returns 校验结果
 */
export function verifyCaptcha(id: string, input: string): CaptchaVerdict {
  const entry = store.get(id);

  /* id 不存在有两种可能：本来就没生成过（伪造），或者已经被清扫掉了（过期太久）。 */
  if (!entry) return 'expired';

  if (entry.expiresAt <= Date.now()) {
    store.delete(id);
    return 'expired';
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    store.delete(id);
    return 'too_many';
  }

  if (entry.answer !== input.trim().toLowerCase()) {
    // 记一次失败。单线程 Node 里 `+= 1` 不存在并发丢计数的问题
    entry.attempts += 1;
    return 'invalid';
  }

  return 'ok';
}

/**
 * 销毁一枚验证码（整个请求成功时调用）。
 * @param id 生成时返回的 id
 */
export function consumeCaptcha(id: string): void {
  store.delete(id);
}
