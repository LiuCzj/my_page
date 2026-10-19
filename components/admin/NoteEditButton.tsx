'use client';

/** 笔记详情页的「编辑」入口。编辑器按需加载 —— 访客用不到，不该算进公开页的包体积。 */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { NoteRecord } from '@/lib/content';
import { formFromRecord } from './note-form';

/** 只有真的点开「编辑」才下载编辑器 */
const NoteEditor = dynamic(() => import('./NoteEditor').then((m) => m.NoteEditor), { ssr: false });

/**
 * @param props.note 当前笔记的完整记录（服务端已按 canEdit 决定要不要渲染本组件）
 */
export default function NoteEditButton({ note }: { note: NoteRecord }) {
  const { d } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-soft">
        <Pencil size={15} aria-hidden="true" />
        {d.admin.edit}
      </button>

      {open && (
        <NoteEditor
          initial={formFromRecord(note)}
          isNew={false}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
