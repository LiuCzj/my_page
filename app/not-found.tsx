'use client';

/**
 * 404 页。
 *
 * 做成客户端组件是为了能读语言字典（原来的「页面去了另一个维度 🌀」是硬编码中文，
 * 切到英文后这句还留着中文）。它渲染在根布局内，所以 I18nProvider 一定在上层。
 */

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { d } = useI18n();

  return (
    <div className="mx-auto max-w-4xl px-4 py-24 text-center">
      <p className="text-6xl font-black text-accent">404</p>
      <h1 className="mt-4 text-2xl font-bold text-foreground">{d.pages.notFound.title}</h1>
      <p className="mt-2 text-muted-foreground">{d.pages.notFound.desc}</p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground no-underline transition hover:brightness-110"
      >
        {d.pages.notFound.back}
      </Link>
    </div>
  );
}
