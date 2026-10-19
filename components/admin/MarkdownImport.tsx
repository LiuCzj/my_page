'use client';

/** 「上传 Markdown 文件」按钮 —— 选一个 .md/.markdown/.txt 文件，自动把里面的 */

import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { parseMarkdownFile, type ParsedMarkdownFile } from '@/lib/parse-md-file';

export default function MarkdownImport({
  onParsed,
}: {
  /** 解析完成后回调（由调用方把结果填进表单） */
  onParsed: (r: ParsedMarkdownFile) => void;
}) {
  const { d } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);

  const pick = async (file: File) => {
    setName(file.name);
    const raw = await file.text();
    // 文件名去掉扩展名，当作没有 title 时的兜底标题
    onParsed(parseMarkdownFile(raw, file.name.replace(/\.[^.]+$/, '')));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn-soft"
      >
        <Upload size={15} aria-hidden="true" />
        {d.admin.importFile}
        {name && <span className="max-w-[10rem] truncate text-xs font-normal text-muted-foreground">· {name}</span>}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,.mdx,text/markdown,text/plain"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          // 清空 value，这样同一个文件可以反复选
          e.target.value = '';
        }}
      />
    </>
  );
}
