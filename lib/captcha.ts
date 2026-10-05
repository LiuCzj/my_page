/**
 * 图形验证码：生成 + 校验（2026-10-05 新增）。
 *
 * 【用哪个库、为什么】`svg-captcha`（1.4.0，MIT，102 KB，纯 JS，只带 opentype.js + tiny-inflate 两个依赖）。
 * 选它是因为一条硬指标：**它用 opentype.js 把字符转成 `<path>` 轮廓，生成的 SVG 里没有 `<text>`**。
 * 实测确认过：`/<text/i` 不命中、答案原串也不在源码里，元素只有 `<svg>` 和若干 `<path>`。
 * 如果字符是以文本节点写进 SVG 的，脚本一行正则就能把答案读走 —— 那种验证码等于没做。
 * 另外它不依赖 node-canvas，没有原生编译，Windows 开发机和 Linux 服务器上行为一致。
 *
 * 【答案存在哪：内存，不落库】
 * 验证码是**短命的一次性数据**（5 分钟），落库要建表、要清理、每次渲染都写一次盘，收益不匹配。
 * 内存 Map + 过期清扫 + 容量上限就够了。
 * ⚠️ **代价说清楚**：服务重启后，用户手上已经打开的验证码会失效（点「换一张」即可）；
 * 将来要是多实例部署，内存不共享，必须换成数据库或 Redis。当前是单进程部署，没问题。
 *
 * 【三道防线】5 分钟过期、最多试 5 次、**成功后由调用方显式销毁**。
 * 三道叠起来，5 位字符（约 100 万种）的暴力枚举在 5 分钟窗口内不可能完成。
 *
 * 【为什么「校验」和「销毁」要分成两个函数 —— 这是被 UX 逼出来的设计】
 * 最自然的写法是「校验通过就立刻删掉」，但那样会出一个很难受的场景：
 *   用户图形验证码填对了、邮箱验证码填错了 → 接口返回「邮箱验证码不对」，
 *   用户改完邮箱码再提交 → 图形验证码已经被上一轮消耗掉了 → 提示「图形验证码过期」，
 *   他得重新读一张图、重填一遍。
 * 一次填错要付出两份代价，这是设计问题不是用户问题。
 * 所以拆成：`verifyCaptcha` 只判断对错（错就记一次尝试，对的**先留着**），
 * 整个请求都成功了再由调用方 `consumeCaptcha` 收尾。
 *
 * 【这样拆分带来的代价，得说清楚】一枚已经答对的验证码，在它被销毁前（或 5 分钟内）
 * 可以被重复提交。也就是说「解一次图 = 可以反复用」，比「答对即作废」弱一档。
 * 之所以能接受：注册那条路上还有邮箱验证码挡着（每次都要一枚新的、发到真实邮箱），
 * 再加上同 IP 十分钟最多 5 次注册的限流 —— 一个验证码最多也就换来 5 次尝试，
 * 而每次都要有可用的邮箱验证码。相比「用户填错一次就要重读图」，这个取舍是值的。
 *
 * 【比较方式】统一转小写再比 —— 用户看到大写字母但习惯性敲小写是常事，
 * 为这个把人挡在外面没有意义（真正的防暴力靠上面的尝试次数上限，不靠大小写敏感）。
 */

import { randomBytes } from 'node:crypto';
import svgCaptcha from 'svg-captcha';

/** 校验结果。分四种是为了让前端能给出不同的下一步动作 */
export type CaptchaVerdict = 'ok' | 'expired' | 'invalid' | 'too_many';

/** 有效期：5 分钟。够用户读完输入，又不至于留一个长期可用的入口 */
const TTL_MS = 5 * 60 * 1000;

/** 同一枚验证码最多被试几次，超过即作废 */
const MAX_ATTEMPTS = 5;

/**
 * 内存里最多同时存多少枚。
 * 上限的作用是防「有人狂刷 /api/auth/captcha 把内存撑爆」——
 * 超了就按插入顺序丢最早的（Map 保持插入序），
 * 被丢掉的用户点「换一张」即可，不会影响正常使用。
 */
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
 *
 * 【为什么每次生成都扫一遍】没有定时器、没有后台任务 ——
 * 这个接口的调用频率天然很低（只有打开注册/注销表单时才会调），
 * 每次顺手扫一遍的开销可以忽略，还省掉了一个需要管理的生命周期。
 *
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
 *
 * @returns `id` 交给前端随表单回传；`svg` 是可直接内联到页面的 SVG 字符串
 */
export function createCaptcha(): { id: string; svg: string } {
  const now = Date.now();
  sweep(now);

  const captcha = svgCaptcha.create({
    size: CAPTCHA_SIZE,
    /*
      排掉易混字符：0 与 o、1 与 l 与 I。
      这不是洁癖 —— 验证码输错一次的代价是用户要重填整张注册表单，
      少一个「这是零还是字母 O」的犹豫就少一批放弃的人。
    */
    ignoreChars: '0o1ilI',
    /*
      ── 下面这几个数是量出来的，别凭感觉调（2026-10-05 调参记录）──
      【踩过的坑】第一版写的是 `fontSize: 42` + `noise: 3` + 设了 background。
      结果：字符比这个库的**默认值（fontSize 56）还小**，三条干扰线横穿字面，
      抽五张我肉眼读起来都很吃力 —— 这种验证码等于在赶客。
      【关键机制：设了 background 就会强制打开 color】库源码里是
      `if (bg) options.color = true`，所以「浅色底 + 深色字」和「彩色字符」不能兼得。
      既然这样，就**不设 background**（SVG 保持透明），字符走 `color: false` 的
      近黑色（greyColor(0,4)），浅色底由组件那边的 CSS 容器给 —— 对比度最高，
      而且深浅两套主题下长得一样。
      【width/height/fontSize 三者的关系】字符按 `spacing = (width-2)/(size+1)`
      横向均分，纵向以 height/2 附近为基线。fontSize 60 配 200×60 实测字面饱满、
      五个字不互相压叠；再小就发虚，再大就会切顶。
    */
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
 *
 * ⚠️ **答对时不会销毁**，销毁由调用方在整个请求成功时通过 `consumeCaptcha` 完成。
 * 为什么要这样拆，见文件头「校验和销毁为什么分成两个函数」。
 *
 * @param id 生成时返回的 id
 * @param input 用户填的字符
 * @returns 校验结果
 */
export function verifyCaptcha(id: string, input: string): CaptchaVerdict {
  const entry = store.get(id);

  /*
    id 不存在有两种可能：本来就没生成过（伪造），或者已经被清扫掉了（过期太久）。
    两者对用户是同一件事 —— 都得重新拿一张，所以都回 'expired'，
    不额外区分「伪造」，免得给探测者反馈信息。
  */
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
 *
 * 【为什么不是 verifyCaptcha 内部顺手删】见文件头。
 * 幂等：对已经不存在的 id 调用不报错 —— 调用方不需要关心它是否还在。
 *
 * @param id 生成时返回的 id
 */
export function consumeCaptcha(id: string): void {
  store.delete(id);
}
