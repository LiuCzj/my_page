'use client';

/**
 * 笔记详情页顶部的「返回笔记列表」。
 *
 * 【为什么单独抽一个 6 行的组件】
 * 详情页本身是服务端组件（要读文件、要生成静态页），而「返回笔记列表」这句话
 * 要跟着中英切换 —— 那是客户端字典的事。服务端组件里读不到字典，
 * 所以这一行必须是一个客户端组件。整个详情页只有这一处需要字典。
 *
 * 【为什么要 min-h-[44px]】
 * 它是一行文字链接，本身只有 20 来像素高。手机上手指点这么窄的一条很费劲，
 * 撑到 44px 是站里对可点元素的统一底线。
 */

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
