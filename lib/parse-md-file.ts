/** 解析整篇 Markdown 文件：拆出 frontmatter（标题/日期/摘要/标签/草稿）与正文。 */

export interface ParsedMarkdownFile {
  title: string;
  /** 'YYYY-MM-DD'；解析不出来时给今天 */
  date: string;
  summary: string;
  tags: string[];
  draft: boolean;
  /** 去掉 frontmatter 之后的正文 */
  body: string;
}

/** 去掉首尾引号 */
function unquote(v: string): string {
  const s = v.trim();
  if (s.length >= 2 && ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'"))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 解析 tags。两种常见写法都认。 */
function parseTags(value: string, lines: string[], startIndex: number): string[] {
  const inline = value.match(/^\[(.*)\]$/);
  if (inline) {
    return inline[1]
      .split(',')
      .map((s) => unquote(s))
      .filter(Boolean);
  }

  // 块列表：从下一行开始，连续的 `  - xxx`
  const out: string[] = [];
  for (let i = startIndex + 1; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+(.+)$/);
    if (!m) break;
    out.push(unquote(m[1]));
  }
  return out;
}

/**
 * 解析一篇 Markdown 文件。
 * @param raw 文件全文
 * @param fallbackTitle frontmatter 里没有 title 时用（一般传文件名去掉扩展名）
 * @returns 拆好的字段 + 正文
 */
export function parseMarkdownFile(raw: string, fallbackTitle: string): ParsedMarkdownFile {
  /* 去 BOM；换行统一成 LF —— 行尾的 \r 会让编辑器的字符列号整体错位 */
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  const result: ParsedMarkdownFile = {
    title: fallbackTitle,
    date: new Date().toISOString().slice(0, 10),
    summary: '',
    tags: [],
    draft: false,
    body: text,
  };

  // frontmatter：文件开头必须是 `---`，到下一个 `---`（或 `...`）结束
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\r?\n?/);
  if (!fm) return result;

  const lines = fm[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();

    if (key === 'title' && value) result.title = unquote(value);
    else if (key === 'date' && value) {
      // gray-matter 会把没引号的日期解析成 Date（带时区）；这里一律取前 10 位字符
      const d = unquote(value);
      const iso = d.match(/^\d{4}-\d{2}-\d{2}/);
      if (iso) result.date = iso[0];
    } else if (key === 'summary' && value) result.summary = unquote(value);
    else if (key === 'tags') result.tags = parseTags(value, lines, i);
    else if (key === 'draft') result.draft = /^(true|yes|1)$/i.test(unquote(value));
  }

  result.body = text.slice(fm[0].length).trim();
  return result;
}
