'use client';

/** 笔记详情页顶部的「返回笔记列表」。 */

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function NoteBackLink() {
  const { d } = useI18n();

  return (
    <Link
      href="/notes"
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-accent"
    >
      <ArrowLeft size={15} aria-hidden="true" />
      {d.notes.back}
    </Link>
  );
}
