'use client';

/** 全局键盘层的组装件 —— 把「快捷键注册」「快捷键说明面板」「站内搜索面板」 */

import { useCallback, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useHotkeys } from '@/lib/use-hotkeys';
import { useI18n } from '@/lib/i18n';
import ShortcutHelp from './ShortcutHelp';
import SiteSearch, { type SearchNote, type SearchProject, type SearchSkillGroup } from './SiteSearch';

interface ShortcutLayerProps {
  /** 服务端读好的笔记索引（slug / title / summary / tags）。 */
  notes: SearchNote[];
  /** 服务端读好的项目列表。站内搜索用它建「项目」那一组的条目。 */
  projects: SearchProject[];
  /** 服务端读好的技术栈分组。 */
  skills: SearchSkillGroup[];
}

/**
 * 挂载全局键盘能力、两个浮层，以及快捷键的常驻入口。
 * @param props.notes    服务端传下来的笔记索引
 * @param props.projects 服务端传下来的项目列表
 * @param props.skills   服务端传下来的技术栈分组
 * @returns 一个常驻小按钮 + 两个浮层；除按钮外不产生可见布局
 */
export default function ShortcutLayer({ notes, projects, skills }: ShortcutLayerProps) {
  const { d } = useI18n();

  /** 搜索面板的开合。唯一的真实来源在这里，键盘与（将来的）顶栏按钮都改它 */
  const [searchOpen, setSearchOpen] = useState(false);
  /** 快捷键说明面板的开合。入口有两个：`?` 键（面板自己监听）和下面那颗常驻按钮 */
  const [helpOpen, setHelpOpen] = useState(false);

  /** 打开搜索。 */
  const openSearch = useCallback(() => setSearchOpen(true), []);

  /** 常驻按钮的点击入口，同上 */
  const openHelp = useCallback(() => setHelpOpen(true), []);

  /** 注册全局快捷键。 */
  useHotkeys({ onSearch: openSearch });

  return (
    <>
      {/* 快捷键说明面板：受控，开合由上面的 helpOpen 决定 */}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />

      {/* 快捷键的常驻入口。 */}
      <button
        type="button"
        onClick={openHelp}
        aria-label={d.shortcuts.open}
        aria-haspopup="dialog"
        className="pointer-fine:flex fixed bottom-4 left-4 z-[70] hidden items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur transition-colors hover:border-accent/50 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Keyboard size={14} aria-hidden="true" />
        <kbd className="font-mono">?</kbd>
      </button>

      {/* 站内搜索：受控，由上面的 searchOpen 决定 */}
      <SiteSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        notes={notes}
        projects={projects}
        skills={skills}
      />
    </>
  );
}
