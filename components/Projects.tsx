'use client';

/**
 * 「项目」区块。
 *
 * 现在 config/site.ts 里的 projects 是空数组 —— 我没有你的任何项目数据，
 * 所以这里渲染的是一句诚实的空态，而不是编三个项目把格子填满。
 * 你往里填一条，空态立刻换成卡片列表，这段代码不用改。
 *
 * 首屏的「查看我的项目」就是滚到这里（#projects）。
 */

import { motion } from 'framer-motion';
import { ArrowUpRight, FolderOpen } from 'lucide-react';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useReveal } from '@/lib/use-reveal';

export default function Projects() {
  const { d, pick } = useI18n();
  const reveal = useReveal();
  const list = site.projects;

  return (
    <section
      id="projects"
      className="scroll-mt-[var(--anchor-offset)] pb-2"
      aria-labelledby="projects-title"
    >
      <motion.h2
        {...reveal(0)}
        id="projects-title"
        className="text-2xl font-black tracking-tight text-foreground sm:text-3xl"
      >
        {d.projects.title}
      </motion.h2>

      {list.length === 0 ? (
        /* 空态：明确说「这里还空着」，并给出下一步，而不是留一个看起来坏掉的洞 */
        <motion.div
          {...reveal(0.06)}
          role="status"
          className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-center sm:p-8"
        >
          <FolderOpen size={22} className="mx-auto text-accent" aria-hidden="true" />
          <p className="mt-3 text-base font-semibold text-foreground">{d.projects.empty}</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            {d.projects.emptyHint}
          </p>
        </motion.div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {list.map((p, i) => (
            <motion.li key={p.url + i} {...reveal(0.06 * (i + 1))}>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full flex-col rounded-lg border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-out hover:border-accent/50 hover:shadow-md sm:p-5"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-lg font-bold leading-snug text-foreground">{pick(p.title)}</span>
                  <ArrowUpRight size={17} className="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                </span>
                <span className="mt-2 text-sm leading-relaxed text-muted-foreground">{pick(p.summary)}</span>
                {p.stack.length > 0 && (
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {p.stack.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </span>
                )}
              </a>
            </motion.li>
          ))}
        </ul>
      )}
    </section>
  );
}
