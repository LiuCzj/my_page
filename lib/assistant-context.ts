/**
 * 数字分身的「站内知识」检索层。
 *
 * 【它解决什么问题】
 * 改之前，分身的 system prompt 里只有 config/site.ts 那份**静态**事实
 * （名字、技术方向、联系方式、三个高频问题）。笔记和项目是存在数据库里的、
 * 站长随时会在后台加，但提示词完全不知道它们存在 ——
 * 于是访客问「总结一下第一篇笔记的要点」，分身只能回「这个不在我能回答的范围内」。
 * 页面明明有内容，分身却像个只会背名片的客服。
 *
 * 【为什么用检索，而不是把全部内容塞进提示词】
 * 笔记正文会越写越多。全量塞进去有三个问题：
 *   ① 超上下文长度（模型直接报错或截断）；
 *   ② 每次请求都为全部内容付 token 钱，而访客九成问题只跟一两篇有关；
 *   ③ 噪声太多会稀释提示词里那些「只答本站内容」的硬约束，模型反而更容易跑偏。
 * 所以做法是：**只在访客真的问了、且问到点子上时，取最相关的几段**塞进去。
 *
 * 【检索算法为什么是「关键词打分」而不是向量检索】
 *   · 本站内容量级是「几十篇笔记、几万字」，纯 JS 打分几毫秒就扫完了；
 *     引入 embedding 要先调一次模型/本地模型算向量、再维护向量库，还得处理
 *     增删改后的索引失效 —— 为一个个人站引入这套基础设施不成比例。
 *   · 中文没有天然空格分词，但本站**关键词几乎都是专有名词**
 *     （「大模型」「Next.js」「SQLite」「知识库」「Agent」），它们本身就是
 *     不该被拆开的连续串。所以这里用「查询串切片 + 子串命中」而不是分词：
 *     把访客的问句切成候选词，再去正文里找谁包含它，简单且对专有名词准确。
 *   · 这与 lib/search-index.ts 的站内搜索用同一套思路（大小写不敏感的子串匹配），
 *     保持全站一致，不额外引库。
 *
 * 【为什么这个文件不能有 'use client'】
 * 它 import lib/content.ts，而那边依赖 better-sqlite3（原生模块）。
 * 一旦被客户端组件静态引入，原生模块会被打进浏览器包、构建直接失败。
 * 所以它**只能被服务端**（app/api/assistant/route.ts）调用。
 */

import { listNoteMetas, listProjects, listSkillGroups, getNoteRecord } from '@/lib/content';
import type { LocalizedText } from '@/config/site';

/**
 * 一段可被检索的站内内容片段。
 *
 * 【为什么按「段」切而不是按「篇」切】
 * 一篇笔记可能几千字、讲好几个不相关的事。整篇塞进去既浪费 token，
 * 又让模型分不清访客问的是哪一段。按空行切成段落，检索的粒度才和问题对得上。
 */
interface Chunk {
  /** 归属的展示名称（笔记标题 / 项目名 / 技术栈组名），给模型做上下文用 */
  source: string;
  /** 这一段的正文 */
  text: string;
  /** 站内路径，让分身能顺带告诉访客「详见 /notes/xxx」 */
  href: string;
}

/**
 * 打分用的查询候选词。
 *
 * 【为什么要过滤掉这些停用词】
 * 中文问句里大量「的、了、吗、一下、什么」这类字。若拿单字去匹配正文，
 * 「什么」里的「么」几乎命中所有段落，相关性排序会被彻底冲垮。
 * 所以短于 2 个字、或命中的是这类虚词，直接丢。
 */
const STOP_CHARS = new Set([
  '的', '了', '吗', '呢', '吧', '啊', '是', '在', '有', '和', '与', '或',
  '我', '你', '他', '它', '这', '那', '什', '么', '怎', '样', '请', '帮',
  '一', '下', '个', '些', '可以', '能', '会', '要', '就', '都', '也', '还',
  '什么', '怎么', '如何', '哪些', '哪个', '一下', '总结', '介绍', '讲讲', '说说',
  /*
    【2026-10-06 补：把「问句骨架」整段列为停用词】
    这批词是长问句的通用框架，几乎每个问题都会带（「是怎么组织的」「怎么用在哪」）。
    它们**本身不携带任何主题信息**，却因为出现在几乎所有问句里而产生最坏的效果：
    只要站内有某篇笔记的**标题**恰好也用了这套骨架（本站就有一篇叫
    「这个站点的内容是怎么组织的」），它就会被这套骨架命中、吃到标题加权，
    在访客问**完全无关**的话题时也稳居第一位。
    实测：问「我的@theme令牌是怎么组织的？」，第一名是这个骨架笔记，
    真正讲 theme 的笔记被挤到第三 —— 这就是分身答「不在我能回答的范围内」的原因之一。
    列在这里比写进「垃圾碎片黑名单」更根本：它们从源头就不该成为关键词。
  */
  '组织', '怎么组织', '如何组织', '是怎么', '怎么做', '怎么用', '怎么弄',
  '在哪', '哪里', '哪些地方', '做什么', '干什么', '有什么用', '是什么',
]);

/**
 * 切词前先把「连字符连接的复合标识符」保护起来。
 *
 * 【解决什么】
 * 正则把 `@theme令牌` 按字符类别切成 `theme` + `令牌...` 两段，
 * 于是「@theme 令牌」这个完整概念被劈成两半，两半各自都很弱、也各自都容易误命中。
 * 更糟的是 `@` 本身既不是汉字也不是字母数字，会**无声地**充当分隔符 ——
 * 站长截图里那个问句正是 `我的@theme令牌是怎么组织的？`。
 *
 * 【做法】把 `@` `#` `$` 这类符号与它紧跟的标识符**粘成一个词**再切。
 * 保留 `@theme` 这个整体，才能在正文里精确命中 `@theme` 块；
 * 而 `@theme` 与 `theme` 是包含关系，粘住不会丢掉原有的匹配能力。
 *
 * ⚠️ 不处理独立的 `@`（`@ 某人` 这种）—— 粘出的 `@` 只有 1 字符，会在长度过滤时被丢掉。
 */
function protectIdentifiers(query: string): string {
  // 把 @ # $ 与其后紧跟的字母数字串合成一个 token，并用空格与前后中文隔开
  return query.replace(/([@#$])([A-Za-z0-9][A-Za-z0-9._-]*)/g, ' $1$2 ');
}

/**
 * 把访客的问句切成候选关键词。
 *
 * 【策略】中文按「连续汉字段」切，英文/数字按「连续字母数字段」切。
 * 例如「总结一下第一篇笔记的要点」→ ['总结', '一下', '第一篇笔记', '的', '要点']，
 * 再过滤停用词与长度，得到 ['第一篇笔记', '要点'] 这类真正有区分度的词。
 *
 * 【2026-10-06 修：这里是本轮 bug 的核心，三处改动都要看懂再动】
 *
 * ⚠️ **改动一：长汉字段不再机械滑窗切 4 字（去掉垃圾碎片）**
 * 旧做法把超过 4 字的汉字段**每 2 字取一个 4 字窗口**：
 * 「令牌是怎么组织的」→ `令牌是怎` / `是怎么组` / `么组织的` / `织的`。
 * 这批碎片里混着虚词、没有一个是真词，却照样能子串命中正文 —— 于是产生大量假阳性，
 * 尤其会去命中**标题**里恰好含这套骨架的无关笔记（本站有一篇叫「…是怎么组织的」）。
 *
 * ⚠️ **改动二：先按停用字切出自然短语，再对长短语滑窗（步长 1、窗口 3）**
 * 切分点是**停用字**而不是固定间距，所以切出来的是 `令牌` / `组织的` 这种自然边界。
 * 长短语滑窗改成步长 1（不漏任何组合）+ 窗口 3（短，不容易出长垃圾）。
 *
 * ⚠️ **改动三：组合短语要拆出子词（本条解决「命中 0 段」）**
 * `主题令牌` 是一个「相邻两词粘合」的短语（主题 + 令牌），它在正文里**从来没原样出现过** ——
 * 正文写的是「主题被搬进了 CSS」「为什么颜色令牌存的是三个数字」，两个词分处不同的句子。
 * 子串匹配要求整串出现，于是 `主题令牌` 命中 0 段，整个问句就废了。
 * 但「主题」和「令牌」都真实存在于那篇笔记里 —— **两个词都出现，才是强信号**。
 * 所以对长度 ≥4 的汉字片段，除了保留原词，**再按 2 字粒度补一层子词**，
 * 让「主题令牌」也能靠 `主题` + `令牌` 双命中把正确笔记顶上来。
 *
 * 【为什么子词只补到 2 字、不补 1 字】
 * 单字在中文里几乎必然出现（「的」出现的频率比任何实词都高），补 1 字等于给所有段落加噪声。
 * 2 字是中文里最小的「可能承载意义」的单位（「主题」「令牌」「笔记」都是词）。
 *
 * @param query 访客原始问句
 * @returns 去重后的候选关键词（已转小写）
 */
function extractKeywords(query: string): string[] {
  // 先把标点统一换成空格，避免「第一篇笔记，的」这种被当成一个整串
  const normalized = protectIdentifiers(query).replace(
    /[，。！？；：、,.!?;:()[\]{}"'`]/g,
    ' ',
  );
  // 连续汉字段 与 连续英文数字段 各取一份；英数字段内部允许 . - 以保住 "Next.js"、"node-fetch"
  const raw = normalized.match(/[@#$]?[\u3400-\u9fff]+|[@#$]?[A-Za-z0-9][A-Za-z0-9._-]*/g) ?? [];

  const out: string[] = [];
  /** 往结果里放一个候选词；长度不足、是停用词、或只是停用词加符号的一律丢掉 */
  const push = (piece: string) => {
    // 去掉可能粘上的前导符号后再做质量检查，`@theme` 保留符号本身
    const core = piece.replace(/^[@#$]/, '');
    if (core.length < 2) return;
    if (STOP_CHARS.has(piece)) return;
    if (STOP_CHARS.has(core)) return; // `@的` 这种无意义的粘合
    out.push(piece);
  };

  /**
   * 按停用字把一段长汉字串切成若干自然片段。
   *
   * 【为什么以「单字」为界切】STOP_CHARS 里既有单字（的/是/怎）也有双字词（什么/怎么）。
   * 单字切分会把「什么」也切开（`什` `么`），但两个残片都会因为长度 1 被丢掉，
   * 不会污染结果 —— 代价只是「什么」这个双字停用词没被整体识别，而这在切分场景下无影响。
   *
   * @param text 连续汉字段
   * @returns 自然短语片段（可能为空串，调用方自行过滤）
   */
  const splitByStopChars = (text: string): string[] => {
    const parts: string[] = [];
    let buf = '';
    for (const ch of text) {
      if (STOP_CHARS.has(ch)) {
        if (buf) parts.push(buf);
        buf = '';
      } else {
        buf += ch;
      }
    }
    if (buf) parts.push(buf);
    return parts;
  };

  /** 关键词长度上限：超过这个长度的短语几乎不可能在正文里原样出现，不如拆子词 */
  const MAX_PHRASE = 6;

  for (const token of raw) {
    const lower = token.toLowerCase();
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      // ── 纯汉字：先按停用字切出自然短语，过长的再滑窗 ──
      for (const part of splitByStopChars(token)) {
        if (part.length < 2) continue;

        if (part.length <= MAX_PHRASE) {
          push(part);
        } else {
          // 步长 1、窗口 3：密采样不漏组合，短窗口不出长垃圾
          for (let i = 0; i + 3 <= part.length; i += 1) push(part.slice(i, i + 3));
        }

        /*
          组合短语补子词（改动三）：长 ≥4 的片段，再按 2 字粒度补一层。
          保留原词是为了「原样出现」这种最强信号；补子词是为了「两个词分别出现」也能命中。
          两者并存，让长短语既能精确命中（权重高）又不至于完全失配。
        */
        if (part.length >= 4) {
          for (let i = 0; i + 2 <= part.length; i += 1) push(part.slice(i, i + 2));
        }
      }
    } else if (lower.length >= 2) {
      // ── 英文/数字/带符号标识符：整体保留（`@theme`、`next.js`、`v4`）──
      push(token);
    }
  }
  return [...new Set(out)];
}

/**
 * 构造全站的可检索片段集合。
 *
 * 【内容来源】
 *   · 笔记：正文按空行切段（正文只有中文，见 lib/content.ts 说明）
 *   · 项目：标题 + 摘要 + 技术栈拼成一段（项目本身没有长正文）
 *   · 技术栈：每个分组的「组名 + 小节 + 条目」拼成一段
 *
 * 【为什么要带上 href】
 * 提示词里明确要求「指路只能指真实存在的路径」。把 href 一并给模型，
 * 它才能说「详见 /notes/xxx」而不是编一个路径出来。
 *
 * 【草稿怎么处理】listNoteMetas() 默认在生产环境不含草稿，
 * 这里沿用默认值 —— 草稿是没发布的，分身不该提前剧透。
 *
 * @returns 全部候选片段
 */
function buildChunks(): Chunk[] {
  const chunks: Chunk[] = [];

  // ── 笔记：每篇的正文切片 ──
  for (const meta of listNoteMetas()) {
    const record = getNoteRecord(meta.slug);
    if (!record) continue;
    const href = `/notes/${meta.slug}`;

    // 标题行本身也是一段（访客直接问「有哪些笔记讲 X」时靠它命中）
    chunks.push({
      source: meta.title,
      text: `${meta.title}｜${meta.summary}｜标签：${meta.tags.join('、') || '无'}`,
      href,
    });

    // 正文按空行分段。一段太短（<10 字）多半是小标题或残留，跳过；
    // 太长（>600 字）说明原文没分段，硬切一刀免得一段就吃掉全部预算。
    for (const para of record.body.split(/\n\s*\n/)) {
      const text = para.trim();
      if (text.length < 10) continue;
      if (text.length <= 600) {
        chunks.push({ source: meta.title, text, href });
      } else {
        for (let i = 0; i < text.length; i += 600) {
          chunks.push({ source: meta.title, text: text.slice(i, i + 600), href });
        }
      }
    }
  }

  // ── 项目：标题 + 摘要 + 技术栈 ──
  for (const project of listProjects()) {
    const title = pickLang(project.title);
    chunks.push({
      source: title,
      text: `项目「${title}」：${pickLang(project.summary)}｜技术栈：${project.stack.join('、') || '未标注'}${project.date ? `｜${project.date}` : ''}｜仓库：${project.url}`,
      href: '/projects',
    });
  }

  // ── 技术栈：每个分组一条 ──
  for (const group of listSkillGroups()) {
    const gtitle = pickLang(group.title);
    const items = group.sections
      .map((s) => {
        const label = pickLang(s.label);
        const list = s.items.map(pickLang).join('、');
        return label ? `${label}：${list}` : list;
      })
      .filter(Boolean)
      .join('；');
    if (!items) continue;
    chunks.push({ source: `${gtitle}`, text: `技术栈·${gtitle}：${items}`, href: '/' });
  }

  return chunks;
}

/**
 * 取一条双语文案的中文侧（缺失时回落到英文）。
 *
 * 【为什么固定取中文】分身默认服务中文访客，且笔记正文只有中文。
 * 项目的英文标题/摘要通常只是中文的翻译，两条都塞进去纯属重复占位。
 * 英文界面下模型仍能读懂中文原文并用自己的话用英文回答 ——
 * 它需要的是「事实」，不是「和界面同语言的原文」。
 *
 * @param text 双语文案
 * @returns 中文（或回落的英文）
 */
function pickLang(text: LocalizedText): string {
  return text.zh || text.en;
}

/**
 * 按访客问题检索最相关的站内片段。
 *
 * 【打分规则】每个关键词命中一次就加一次分，命中的关键词越长权重越高
 * （「@theme」比「theme」更有信息量，不该同分）。标题里命中额外加权 ——
 * 访客问「关于 X 的笔记」时，标题含 X 的那篇显然最该排前面。
 *
 * 【2026-10-06 修三处】
 *
 * ① **标题加权必须封顶**。原来是「每个命中标题的关键词都 +1.5」，不设上限 ——
 *    于是一篇标题恰好像问句骨架的笔记（「这个站点的内容是怎么组织的」），
 *    在访客问**无关话题**时也能靠一堆碎片关键词反复吃到标题加权，稳居第一。
 *    改成「标题命中只算一次」，与原始注释的意图一致（注释早写了「避免标题长就无限加分」，
 *    但代码没做到）。
 *
 * ② **关键词命中的是「出现次数」而不是「有没有」**。原实现对每个关键词只判一次
 *    `includes`，导致一段正文里出现 5 次 `@theme` 与出现 1 次同分。
 *    正文里反复提到某个词，正是「这段在讲这件事」的最强信号，
 *    所以按出现次数累加（设上限，避免一段复读机式文本刷榜）。
 *
 * ③ **短关键词的权重再压低**。碎片化关键词（3 字以内）在中文里极易偶然出现，
 *    给它们与完整术语（`@theme`、`next.js`）近似的权重会淹没真正的信号。
 *
 * @param query 访客问句
 * @param limit 最多返回几段（默认 4：够回答，又不至于撑爆提示词）
 * @returns 按相关度倒序的片段；一个问题都没命中时返回空数组
 */
export function retrieveContext(query: string, limit = 4): Chunk[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  /** 每个关键词在一段正文里最多按几次出现计分：正文复读时不应无限刷分 */
  const OCCURRENCE_CAP = 3;

  const scored = buildChunks().map((chunk) => {
    const haystack = chunk.text.toLowerCase();
    const title = chunk.source.toLowerCase();
    let score = 0;
    /** 标题是否已加过分（见上面 ①：一次为限） */
    let titleBonusUsed = false;

    for (const kw of keywords) {
      // ── 数出现次数（用 indexOf 循环而不是 split，免得为正则转义发愁）──
      let occurrences = 0;
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(kw, from);
        if (at === -1) break;
        occurrences += 1;
        if (occurrences >= OCCURRENCE_CAP) break;
        from = at + kw.length;
      }
      if (occurrences === 0) continue;

      /*
        权重 = 关键词长度收益 × 出现次数。
        · 长度收益 `1 + kw.length * 0.35`：`@theme`(6) → 3.1，`theme`(5) → 2.75，
          3 字碎片 → 2.05。长词更具体、更该压过碎片。
        · 出现次数上限 3，避免个别段落靠复读某个词刷榜。
      */
      score += (1 + kw.length * 0.35) * occurrences;

      // 标题命中：整段只加一次（原来每个关键词都加，会被碎片刷爆）
      if (!titleBonusUsed && title.includes(kw)) {
        score += 3;
        titleBonusUsed = true;
      }
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.chunk);
}

/**
 * 把检索到的片段渲染成一段可拼进 system prompt 的「站内资料」文本。
 *
 * 【为什么要把 href 明写出来】提示词里有一条硬约束：「指路只能指真实存在的路径，
 * 不要提不存在的路径」。给出真实 href，模型才能照着说，而不是自己编。
 *
 * 【为什么明确标注「不确定就说不确定」】即便检索到了片段，也可能是弱相关。
 * 让模型知道「这是检索结果、不是完整内容」，它才不会把一段当全部来下结论。
 *
 * @param chunks retrieveContext 的返回值
 * @returns 拼好的资料段落；无片段时返回空串（调用方据此跳过这一段）
 */
export function formatContext(chunks: Chunk[]): string {
  if (chunks.length === 0) return '';
  const blocks = chunks.map(
    (c, i) => `【资料 ${i + 1}｜来自「${c.source}」｜路径 ${c.href}】\n${c.text}`,
  );
  return blocks.join('\n\n');
}
