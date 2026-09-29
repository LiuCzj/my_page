'use client';

/**
 * 首屏：头像 + 名字 + 一句话介绍。
 *
 * 只负责第一眼看到什么，个人信息细节在 components/InfoCard.tsx。
 *
 * 头像不做循环缩放动画：持续动画在手机上白耗电梯，
 * 也会让开了 prefers-reduced-motion 的用户不适。
 */

import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';

export default function Hero() {
  const { pick } = useI18n();
  const { identity } = site;

  return (
    <section className="flex flex-col items-center pt-4 pb-10 text-center sm:pb-14">
      <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-accent/30 shadow-lg sm:h-32 sm:w-32">
        <img
          src={identity.avatar}
          alt={pick(identity.avatarAlt)}
          width={128}
          height={128}
          className="h-full w-full object-cover"
        />
      </div>

      <h1 className="mt-5 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
        {identity.name.replace(identity.nameAccent, '')}
        <span className="text-accent">{identity.nameAccent}</span>
      </h1>

      <p className="mt-2 max-w-md text-base text-muted-foreground sm:text-lg">
        {pick(identity.tagline)}
      </p>
    </section>
  );
}
