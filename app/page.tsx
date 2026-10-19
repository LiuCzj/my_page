import Hero from '@/components/Hero';
import Dashboard from '@/components/Dashboard';
import Projects from '@/components/Projects';
import NotesList from '@/components/NotesList';
import { Band } from '@/components/SectionBand';
import { homePreview } from '@/config/site';
import { listNoteMetas, listProjects, listSkillGroups } from '@/lib/content';
import { getCurrentUser, isAdmin } from '@/lib/auth';

/** 首页 = 一本四页的小册子。 */
export const dynamic = 'force-dynamic';

export default async function Home() {
  /** 首页只展示最近几篇笔记、前几个项目 */
  const notes = listNoteMetas().slice(0, homePreview.notes);
  const projects = listProjects();

  /** 技术栈分组。 */
  const skillGroups = listSkillGroups();
  const me = await getCurrentUser();
  const canEditSkills = !!me && isAdmin(me.email);

  return (
    <>
      {/* 封面。留白比其他三页都大（pb-28），因为它是「一整屏」——四页用同一套留白，翻页感会被抹平成一堵均匀的墙。 */}
      <Band tone="cover" grid innerClassName="pt-2 pb-20 sm:pt-14 sm:pb-28">
        <Hero />
      </Band>

      <Band tone="about">
        <Dashboard skillGroups={skillGroups} canEditSkills={canEditSkills} />
      </Band>

      {/* id="projects" 挪到了这一页的 <Band> 上（原来挂在 Projects 组件自己的 section 上）——首屏那颗「查看我的项目」按钮指向的锚点必须落在**跨页的顶端**，落在内容 */}
      <Band tone="works" id="projects">
        {/* 首页的项目是**摘要**，不给编辑入口 —— 编辑集中在 /projects 页。 */}
        <Projects projects={projects} />
      </Band>

      <Band tone="notes">
        <NotesList notes={notes} headingLevel={2} viewAllHref="/notes" index="03" latin="NOTES" />
      </Band>
    </>
  );
}
