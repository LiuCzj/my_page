'use client';

/**
 * Markdown 编辑器：**左边写、右边实时出效果**（窄屏上下叠）。
 *
 * 【2026-10-04 改版】原来做成「编辑 / 预览」两个页签，用户反馈多此一举 ——
 * 写字时看不到效果，要来回切。现在两边同屏，敲完停 250ms 右边就更新。
 *
 * 【预览为什么打服务端】必须和「发布后访客看到的」完全一致。
 * 若在浏览器里换一个 Markdown 库渲染，两边对表格、代码块、外链的处理迟早会不一样 ——
 * 那种「预览好看、发布跑版」的落差最难查。所以预览直接复用 lib/markdown.ts 的同一条管线
 * （POST /api/admin/render），保证所见即所得。
 *
 * 【为什么 250ms 防抖】不防抖的话每敲一个字打一次接口，服务端要跑一遍完整的
 * remark/rehype 管线 —— 打字会明显发涩。
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';

export default function MarkdownEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { d } = useI18n();
  const [html, setHtml] = useState('');
  const [pending, setPending] = useState(false);
  const timer = useRef<number>(0);

  /** 内容变化后防抖 250ms 再请求预览 */
  useEffect(() => {
    window.clearTimeout(timer.current);
    setPending(true);
    timer.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: value }),
        });
        const data = (await res.json()) as { ok?: boolean; html?: string };
        if (data.ok && typeof data.html === 'string') setHtml(data.html);
      } catch {
        // 预览失败就保持上一次的结果，不打断写作
      } finally {
        setPending(false);
      }
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [value]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">
          {d.admin.writeTab}
          {pending && <span className="ml-1">…</span>}
        </p>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          rows={16}
          className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed text-foreground focus:border-ring focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{d.admin.previewTab}</p>
        {/*
          预览内容来自自己的服务端渲染（内容只有管理员能写，属可信来源，见 lib/markdown.ts）。
          套 .prose-site 让预览和正式页面的正文排版完全一致。
        */}
        <div className="h-[16rem] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background px-4 py-3 lg:h-[calc(16rem*1.6)]">
          {html ? (
            <div className="prose-site" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-sm text-muted-foreground">{d.admin.previewEmpty}</p>
          )}
        </div>
      </div>
    </div>
  );
}
