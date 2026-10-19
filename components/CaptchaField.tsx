'use client';

/** 图形验证码控件：图片 + 「换一张」+ 输入框。 */

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

  /* onChange 放进 ref：它通常是父组件的内联箭头函数，每次渲染都是新引用。 */
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
        {/* 图片容器固定成和 SVG 一样的尺寸（200×60） */}
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
