'use client';

/**
 * 编辑器验证页（临时）。
 *
 * 覆盖：逐行渲染 / 自绘光标 / 点击落点 / 键盘 / 中文输入法 / 右键菜单 / 拖拽选区。
 * 验收通过后本页删除。
 */

import { useState } from 'react';
import MirrorEditor from '@/components/admin/MirrorEditor';

const SAMPLE = `# 第一章 大模型技术与发展

大模型（Large Language Model）是近年来人工智能领域最重要的进展之一。

## 1.1 大模型发展过程

从 2018 年的 GPT-1 到今天，这条路走了大约八年。关键转折点是 **Transformer 架构** 的提出。

- 第一代：以 BERT、GPT 为代表的预训练
- 第二代：以 GPT-3 为代表的规模化
- 第三代：指令微调与对齐

> 规模并非唯一变量，数据质量同样决定最终效果。

行内代码示例：把 \`frontmatter\` 写在文件开头。

链接示例：[项目主页](https://example.com/repo) 上右键应出链接菜单。

图片示例：![示意图](https://example.com/404.png) 上右键应出图片菜单。

| 列一 | 列二 |
| --- | --- |
| 甲 | 乙 |

这一段是特意准备的长句子：长段落会自动折行，折行之后每一行都该能点到准确的位置——把鼠标放到任意一个视觉行的末尾点一下，光标就应该停在那个字的后面，而不是跑到上面或者下面别的行里去；再选中半行试试，高亮也应该贴着手走。`;

export default function LabMirrorPage() {
  const [text, setText] = useState(SAMPLE);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-lg font-bold">路线一 · 逐行 div 编辑器（M2 + M3）</h1>
      <p className="mb-4 text-[13px] text-muted-foreground">
        能做的：点击落点、打字、回车、退格、方向键、Home/End、
        <b className="text-foreground">中文输入法</b>。
      </p>

      <div className="mb-6 rounded-lg border border-border bg-card p-4 text-[12px]">
        <p className="mb-2 font-bold text-foreground">请按下面顺序亲手试（重点是第 5 条）</p>
        <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            <b className="text-foreground">点击落点</b>：在任意一行中间点一下，光标应落在你点的那个字旁边
            （点字的左半边落在字前，右半边落在字后）。
          </li>
          <li>
            <b className="text-foreground">打字</b>：随便打几个英文字母，应就地插入，光标跟着走。
          </li>
          <li>
            <b className="text-foreground">回车 · 续列表</b>：光标放在某个列表项的行尾按回车，
            <b className="text-foreground">下面应自动出现新的 <code>- </code> 项</b>；
            再按一次回车（此时是空项），<b className="text-foreground">列表应退出</b>，变回普通空行。
          </li>
          <li>
            <b className="text-foreground">退格 · 列表行首</b>：光标放到某个列表项的<b className="text-foreground">最开头</b>
            （<code>- </code> 之前）按退格 —— 应是<b className="text-foreground">在它上方插入一个空的 <code>- </code> 项</b>，
            原内容整体下移，<b className="text-foreground">不该把 <code>- </code> 删掉</b>。
          </li>
          <li>
            <b className="text-foreground">中文输入法（重中之重）</b>：切微软拼音，在「是近年」和「来」之间
            打「人工智能」。看四点：① 候选窗正常跟手；② 拼音阶段屏幕上出现带下划线的预编辑串；
            ③ 上屏后<b className="text-foreground">不多不少正好 4 个字</b>；④ 上屏后再打英文字母，能正常输入。
          </li>
          <li>
            <b className="text-foreground">取消组合</b>：打拼音到一半按 <code>Esc</code>，然后打一个英文字母，
            应正常输入（不吞字）。
          </li>
          <li>
            <b className="text-foreground">复制粘贴</b>：选中后 Ctrl+C / Ctrl+X，Ctrl+V 粘贴；
            右键菜单里的粘贴要走浏览器的「剪贴板读取」授权，被拒就<strong className="text-foreground">直接按 Ctrl+V</strong>
            （想恢复右键粘贴：点地址栏的权限图标，把「剪贴板」允许掉）。
          </li>
          <li>
            <b className="text-foreground">拖拽</b>：把 .md 文件拖进来整体导入；把图片文件拖进来会弹插图对话框
            （站内不存文件，要填图床链接）。
          </li>
          <li>
            <b className="text-foreground">撤销 / 重做</b>：Ctrl+Z / Ctrl+Shift+Z（或 Ctrl+Y）。
          </li>
        </ol>
      </div>

      <MirrorEditor
        value={text}
        onChange={setText}
        onImport={(r) => setText(r.body)}
      />

      <div className="mt-6 rounded-lg border border-border p-4">
        <p className="mb-2 text-xs font-bold text-muted-foreground">源码（只读，供比对）</p>
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
          {text}
        </pre>
      </div>
    </div>
  );
}
