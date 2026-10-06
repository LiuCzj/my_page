import Hero from '@/components/Hero';
import Dashboard from '@/components/Dashboard';
import Projects from '@/components/Projects';
import NotesList from '@/components/NotesList';
import { Band } from '@/components/SectionBand';
import { homePreview } from '@/config/site';
import { listNoteMetas, listProjects, listSkillGroups } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';

/**
 * 首页 = 一本四页的小册子。
 *
 * 【2026-10-05 重做：从一个长容器改成四个通栏跨页】
 * 改前整页是「一个 max-w-5xl 容器 + 四块内容 + 三条流光连接线」——
 * 底色只有一层，从上到下一条平色底，块与块之间靠留白和连接线分隔。
 * 读起来是「一条很长的线」，不是「一页一页翻过去」。
 *
 * 现在每一块各自是一个**跨页**（`<Band>`）：自己铺满整个视口宽度、自己的底色、
 * 自己顶部一条 2px 主导色页眉线。滚动时底色一直在变 —— 翻页感就是这么来的，
 * 不是靠加留白。
 *
 * 【四页的顺序与性格】见 components/SectionBand.tsx 的 TONES：
 *   封面（冷、最深）→ 关于我（冷、浅一档）→ 项目（**转暖**）→ 笔记（转冷）
 * 「项目」那一页是全页唯一的暖色底，是整条滚动动线上最强的一次转折。
 *
 * 【FlowLink 为什么撤掉了】
 * 那三条会跑光点的连接线，作用是「把四块缝成一条动线」。现在跨页的底色变化
 * 已经承担了这件事，而且做得更彻底（整屏都在变，不只是中间一条线）。
 * 两样同时留着就是两套「分隔语言」打架。组件文件保留在仓库里没删。
 *
 * 【为什么这个文件是服务端组件，而且不能加 'use client'】
 * 笔记与项目数据都在 SQLite 里，读取要用 better-sqlite3（原生模块）。
 * 一旦这个文件变成客户端组件，原生模块会被打进浏览器包并直接构建失败。
 * 需要客户端能力的那几块（NotesList 的字典、Projects 的交互）各自是客户端组件，
 * 由这里把数据当 props 传下去。
 *
 * 【为什么整页改成按需渲染】内容现在可以在网页上随时改（见 lib/content.ts）。
 * 如果还按构建期预渲染，站长改完会发现「页面没变」—— 因为看到的是构建那一刻的快照。
 * 所以这一页和它下面的 /notes、/projects 都显式声明 force-dynamic：
 * 每次请求现读数据库，改完刷新就生效。代价是每次请求多几次本地 SQLite 查询（毫秒级）。
 */
export const dynamic = 'force-dynamic';

export default async function Home() {
  /**
   * 首页只展示最近几篇笔记、前几个项目，条数见 config/site.ts 的 homePreview。
   * 这几个函数读的都是数据库；库里没内容时返回空数组，首页会显示空态而不是崩掉。
   */
  const notes = listNoteMetas().slice(0, homePreview.notes);
  const projects = listProjects();

  /**
   * 技术栈分组。
   *
   * 【为什么在这一层读】Dashboard 是客户端组件，不能 import lib/content
   * （那边依赖 better-sqlite3 原生模块，进浏览器包会直接构建失败）。所以由这里读好当 props 下去。
   *
   * 【为什么首页要变成 async】判断「是不是管理员」要 await getCurrentUser()，
   * 而它是异步的。这一页本来就是 force-dynamic，多一次本地会话查询是毫秒级，无影响。
   */
  const skillGroups = listSkillGroups();
  const me = await getCurrentUser();
  const canEditSkills = !!me && isAdmin(me.email);

  return (
    <>
      {/*
        封面。留白比其他三页都大（pb-28），因为它是「一整屏」——
        四页用同一套留白，翻页感会被抹平成一堵均匀的墙。

        grid 只在这一页开：那层透视网格是全站唯一的「招牌元素」，
        五页都铺就是壁纸，一页铺才是记号。见 components/SectionBand.tsx 的说明。

        【2026-10-06】原来这里还包着一层 <ChatInset>（聊天面板的让位容器），
        已挪到 app/layout.tsx —— 那样才能对全站所有页面生效，而不是只有首页。
      */}
      <Band tone="cover" grid innerClassName="pt-2 pb-20 sm:pt-14 sm:pb-28">
        <Hero />
      </Band>

      <Band tone="about">
        <Dashboard skillGroups={skillGroups} canEditSkills={canEditSkills} />
      </Band>

      {/*
        id="projects" 挪到了这一页的 <Band> 上（原来挂在 Projects 组件自己的 section 上）——
        首屏那颗「查看我的项目」按钮指向的锚点必须落在**跨页的顶端**，
        落在内容里会让跳转后上面露出半截别的页。
      */}
      <Band tone="works" id="projects">
        {/*
          首页的项目是**摘要**，不给编辑入口 —— 编辑集中在 /projects 页。
          摘要是「让人快速知道你在做什么」，就地能改反而容易误触。
        */}
        <Projects projects={projects} />
      </Band>

      <Band tone="notes">
        <NotesList notes={notes} headingLevel={2} viewAllHref="/notes" index="03" latin="NOTES" />
      </Band>
    </>
  );
}
