'use client';

/**
 * 图形验证码控件：图片 + 「换一张」+ 输入框。
 *
 * 【注册和注销共用同一个组件】两处的需求完全一样（都是「拿一张图 → 读 → 填 → 随表单提交」），
 * 唯一不同的是挂在哪个表单里。做成组件之后，将来要换验证码方案只改这一处。
 *
 * 【状态怎么给出去】用受控模式：父组件持有 `{ id, text }`，本组件通过 `onChange` 回写。
 * 这样父组件提交时直接把这两个字段塞进请求体即可，不需要 ref 或额外的 context。
 *
 * 【为什么换一张时要把已填的字符清空】不清的话，用户看着新图、输入框里还留着上一张的答案，
 * 提交必然失败，而且他很难意识到「图已经换了，我填的是旧的」。
 *
 * 【svg 为什么可以 dangerouslySetInnerHTML】这段 SVG 是服务端用固定模板生成的
 * （见 lib/captcha.ts），不含任何用户输入，没有注入面。
 * 换成一个 `<img src="/api/auth/captcha?id=...">` 也可以，但那样要先把 id 拿到手再请求一次，
 * 多一次往返；而且图片形式下「换一张」还得处理浏览器缓存，不如内联直接。
 *
 * 【加载失败怎么办】把提示写出来、输入框禁用。
 * 不静默 —— 否则用户面对一个空白方块，只会以为是自己网络的问题而反复刷新。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { FIELD, HINT, LABEL, SEND_BTN } from './form-styles';

/** 父组件要持有的一份验证码状态 */
export interface CaptchaValue {
  /** 服务端给的 id，提交时原样回传 */
  id: string;
  /** 用户填的字符 */
  text: string;
}

export default function CaptchaField({
  value,
  onChange,
  idPrefix = 'captcha',
}: {
  value: CaptchaValue;
  onChange: (next: CaptchaValue) => void;
  /** 给 input 的 id 加前缀，同一页面上两个表单同时存在时避免 id 撞车 */
  idPrefix?: string;
}) {
  const { d } = useI18n();
  const [svg, setSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /*
    onChange 放进 ref：它通常是父组件的内联箭头函数，每次渲染都是新引用。
    直接放进 useCallback 的依赖里会让 load 每次都重建，
    配合下面的挂载 effect 就变成「每次父组件渲染都重新拉一张验证码」——
    用户正在看图，图突然换了，永远填不对。
  */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  /** 拉一张新图。换一张、以及挂载时都用它 */
  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/auth/captcha', { cache: 'no-store' });
      const data = await res.json();
      if (!data?.ok || typeof data.svg !== 'string') throw new Error('bad payload');
      setSvg(data.svg);
      // 新图配新 id，同时清空已填的字符（见文件头说明）
      onChangeRef.current({ id: String(data.id ?? ''), text: '' });
    } catch {
      setSvg('');
      setFailed(true);
      onChangeRef.current({ id: '', text: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  // 只在挂载时拉一次。依赖数组故意留空 —— load 已经是稳定引用
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <label className={LABEL} htmlFor={`${idPrefix}-input`}>
        {d.comments.fieldCaptcha}
      </label>
      <input
        id={`${idPrefix}-input`}
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        placeholder={d.comments.fieldCaptchaPlaceholder}
        /* 关掉自动完成与拼写检查：验证码是随机串，让浏览器记住/划红线只会碍事 */
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={8}
        disabled={failed}
        className={`${FIELD} font-mono tracking-[0.2em] disabled:opacity-50`}
      />

      <div className="mt-2 flex items-center gap-3">
        {/*
          图片容器固定成和 SVG 一样的尺寸（200×60，见 lib/captcha.ts 的生成参数）。
          固定尺寸有两个好处：加载中不会跳高度；「换一张」时不会因为新图长度不同而抖一下。
          【浅色底为什么在这里给】生成的 SVG 是透明的、字符是近黑色（理由见 lib/captcha.ts），
          底色由这个容器提供 —— 这样深浅两套主题下验证码长得完全一样，
          不需要它去参与主题（它本质上就是一张图片）。
        */}
        <span className="flex h-[60px] w-[200px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#f2f3fb] ring-1 ring-border">
          {svg ? (
            <span
              className="block h-full w-full"
              /* 内容来自我们自己的固定模板，不含用户输入 —— 见文件头说明 */
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">
              {failed ? d.comments.captchaFailed : d.comments.captchaLoading}
            </span>
          )}
        </span>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className={SEND_BTN}
          aria-label={d.comments.captchaRefresh}
        >
          <RefreshCw size={14} aria-hidden="true" className={loading ? 'animate-spin' : ''} />
          {d.comments.captchaRefresh}
        </button>
      </div>

      {failed && <p className={HINT}>{d.comments.captchaFailed}</p>}
    </div>
  );
}
