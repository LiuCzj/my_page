import type { MDXComponents } from 'mdx/types';

/**
 * MDX 元素映射表。
 *
 * 【为什么必须存在这个文件】
 * @next/mdx 在 App Router 下要求根目录有 mdx-components.tsx 且导出 useMDXComponents，
 * 否则 .mdx 无法渲染。文件名和函数名都是约定，不能改。
 *
 * 【为什么这里既改「样式」又改「结构」】
 * 纯 CSS 只能改外观，改不了 DOM 结构。有两处必须动结构，光靠 CSS 解决不了：
 *
 * 1. 表格 —— GFM 表格在窄屏上必然横向溢出。必须**包一层滚动容器**，
 *    让表格自己在容器里横向滚。不包的话，溢出的是整个文档：
 *    页面被撑宽，顶栏、页脚、所有居中的内容会一起错位。
 * 2. 图片 —— Markdown 的 `![alt](url)` 会渲染成裸 <img>，没有 max-width，
 *    一张大图会直接把容器撑破。必须显式给 max-w-full。
 *
 * 【其余元素为什么不在这里逐个写】
 * h1~h4 / p / ul / ol / blockquote / pre / code / hr 全部交给 globals.css 的
 * `.prose-site` 统一处理。理由有二：一是少写十几个组件；
 * 二是保证「正文排版」只有一处定义，改行距、改字号不用满仓库找。
 *
 * 【外链为什么要单独处理】
 * MDX 里写的站外链接如果不在新标签打开，访客点一下就离开了本站；
 * 而 rel="noopener noreferrer" 是必须的 —— 只写 target="_blank" 的话，
 * 被打开的页面能通过 window.opener 反向操控本站标签页。
 * 站内链接（以 / 开头）不加 target，否则会在新标签里再开一个本站。
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    table: (props) => (
      <div className="my-6 w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border">
        <table className="w-full border-collapse text-sm" {...props} />
      </div>
    ),

    img: (props) => (
      // loading="lazy"：笔记里的配图往往在正文中段，首屏不需要它们
      <img {...props} loading="lazy" className="my-6 h-auto max-w-full rounded-lg border border-border" />
    ),

    a: ({ href, children, ...rest }) => {
      const isExternal = typeof href === 'string' && /^https?:\/\//.test(href);
      return (
        <a
          href={href}
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="font-semibold text-accent underline-offset-4 visited:text-accent hover:underline"
          {...rest}
        >
          {children}
        </a>
      );
    },

    // 传进来的 components 放最后：调用方要覆盖某个元素时以它为准
    ...components,
  };
}
