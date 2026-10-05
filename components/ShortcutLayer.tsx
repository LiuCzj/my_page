'use client';

/**
 * 全局键盘层的组装件 —— 把「快捷键注册」「快捷键说明面板」「站内搜索面板」
 * 以及「快捷键的常驻入口按钮」四者接在一起。
 *
 * 【为什么需要这个中间组件】
 * 这几样各自独立，但有一个共同约束：都必须活在客户端 Provider 内部
 * （useHotkeys 要用 next-themes 的 useTheme、useI18n 的 toggleLang、聊天窗的 useTwinChat），
 * 而 app/layout.tsx 是**服务端组件**，不能直接调用 hook。
 * 所以由这里当那个「客户端入口」：layout 把服务端读好的笔记与项目数据当 props 递进来，
 * 这里负责把状态（两个面板的开合）和事件（Cmd+K → 搜索、点按钮 → 快捷键说明）串起来。
 *
 * 【为什么面板的开合状态住在这里，而不是塞进面板内部】
 * 两个面板都设计成受控（open + onOpenChange）。打开它们的入口不止一个：
 * 搜索有键盘的 Cmd/Ctrl+K，快捷键说明有 `?` 键和下面那颗常驻按钮 ——
 * 状态必须住在这些入口的共同父级，才能多个入口驱动同一个面板。
 * 塞进面板内部就成了「只有自己能打开自己」。
 *
 * 【为什么 props 传的是「已拍平的数据」而不是让这里自己去读】
 * 笔记与项目现在都存在数据库里（lib/content.ts，依赖 better-sqlite3）。
 * 客户端组件一旦 import 那个模块，原生模块会被打进浏览器包并直接构建失败。
 * 所以读取留在服务端（app/layout.tsx），这里只接收纯数据。
 */

import { useCallback, useState } from 'react';
import { Keyboard } from 'lucide-react';
import { useHotkeys } from '@/lib/use-hotkeys';
import { useI18n } from '@/lib/i18n';
import ShortcutHelp from './ShortcutHelp';
import SiteSearch, { type SearchNote, type SearchProject, type SearchSkillGroup } from './SiteSearch';

interface ShortcutLayerProps {
  /**
   * 服务端读好的笔记索引（slug / title / summary / tags）。
   * 站内搜索用它建「笔记」那一组的条目。
   */
  notes: SearchNote[];
  /** 服务端读好的项目列表。站内搜索用它建「项目」那一组的条目。 */
  projects: SearchProject[];
  /**
   * 服务端读好的技术栈分组。
   * 【为什么现在也要传】技术栈可以在网页上编辑、存在数据库里了，
   * 而搜索跑在客户端（碰不到数据库）—— 再让索引去读配置文件就会出现「改了技术栈、搜索里还是旧的」。
   */
  skills: SearchSkillGroup[];
}

/**
 * 挂载全局键盘能力、两个浮层，以及快捷键的常驻入口。
 *
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

  /**
   * 打开搜索。用 useCallback 包一层不是为了性能 ——
   * useHotkeys 内部已经把最新回调存进 ref，不依赖引用稳定；
   * 这里是为了让「打开」这个动作有名字，读代码时一眼看出 Cmd+K 干的是什么。
   */
  const openSearch = useCallback(() => setSearchOpen(true), []);

  /** 常驻按钮的点击入口，同上 */
  const openHelp = useCallback(() => setHelpOpen(true), []);

  /**
   * 注册全局快捷键。
   * 只接管搜索这一个 —— 其余（G H / G P / G N 跳转、Cmd+/ 切主题、G L 切语言、
   * G C 开聊天窗）都在 useHotkeys 内部自己处理完了，不需要外部参与。
   */
  useHotkeys({ onSearch: openSearch });

  return (
    <>
      {/* 快捷键说明面板：受控，开合由上面的 helpOpen 决定 */}
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />

      {/*
        快捷键的常驻入口。

        【为什么必须有这一颗】面板原先只能靠按 `?` 打开 —— 不知道有快捷键的人
        永远按不出第一个问号，等于这个功能只对「已经知道它存在」的人生效。
        这颗按钮是给「不知道」的人看的。

        【为什么在左下角】聊天面板固定在右侧，右下角会跟它打架；左下角是空的。
        【为什么用 pointer-fine:flex 而不是 lg:flex】触屏设备没有键盘，
        按宽度断点会让「窄屏笔记本」这种真有键盘的情况看不到入口。
        【z-[70]】低于聊天面板（z-80）、高于顶栏（z-50）：它只是个提示，不该盖住面板。
      */}
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
