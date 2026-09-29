'use client';

/**
 * 个人信息展示区。
 *
 * 四组内容：记忆点、兴趣、最近在做、擅长方向。
 * 头像和名字在 Hero 里已经出现过，这里不重复。
 * 底部只留一个「往下滑去问分身」的页内锚点。
 */

import { Heart, MessageCircle, User, Wrench } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function InfoCard() {
  const { d, pick } = useI18n();
  const { openChat } = useTwinChat();
  const { identity } = site;

  return (
    <section
      id="info"
      className="scroll-mt-36 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7"
      aria-labelledby="info-card-title"
    >
      <h2 id="info-card-title" className="text-xl font-bold text-card-foreground">
        {d.info.title}
      </h2>

      <dl className="mt-2 grid gap-6 sm:grid-cols-2">
        <div>
          <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Wrench size={13} className="text-accent" aria-hidden="true" />
            {d.info.recentWork}
          </dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {identity.recentWork.map((item) => (
              <span
                key={item.en}
                className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent"
              >
                {pick(item)}
              </span>
            ))}
          </dd>
        </div>

        <div>
          <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <User size={13} className="text-accent" aria-hidden="true" />
            {d.info.expertise}
          </dt>
          <dd className="mt-2 flex flex-wrap gap-1.5">
            {identity.expertise.map((item) => (
              <span
                key={item.en}
                className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground"
              >
                {pick(item)}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Heart size={14} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="font-bold text-foreground">{d.info.interests}</span>
        <span>{identity.interests.map((item) => pick(item)).join(' · ')}</span>
      </p>

      <button
        type="button"
        onClick={openChat}
        className="mt-7 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:border-accent hover:text-accent"
      >
        <MessageCircle size={15} aria-hidden="true" />
        {d.info.goChat}
      </button>
    </section>
  );
}
