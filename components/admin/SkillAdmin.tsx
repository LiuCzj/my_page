'use client';

/**
 * 技术栈管理：磁贴标题行那个「编辑技术栈」按钮 + 一张编辑整份分组的面板。
 *
 * 【为什么是「一张面板改全部」而不是逐组进进出出】
 * 技术栈只有 5 组，而且组之间经常要调顺序、合并、拆分。把所有分组放进同一张面板，
 * 管理员一眼能看到全貌，保存也就一次请求。代价是面板比较长，所以面板自身可滚动。
 *
 * 【为什么条目用多行文本域，而不是「一条一个输入框」】
 * 条目本身只是短标签，一行一个是最快的录入方式，也方便整段粘贴。
 * 逐条开输入框的话，改一组 6 个标签要点 6 次「添加」。
 * 代价是中文与英文两串可能行数不一致 —— 保存时按下标配对，英文短了就回落到中文
 * （见 lib/content.ts 的 replaceSkillGroups），所以不会出现空标签。
 *
 * 【为什么 id 不能改】它是数据库主键，也当 React key。改 id 等于换了一条记录，
 * 「整份替换」会当成新增。分组 id 由前端按 `skill-group-N` 自动生成并保证不重复。
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { SkillGroupRecord } from '@/lib/content';
import EditorPanel from './EditorPanel';

/** 一个小节的表单态：条目用多行字符串承载（换行分开） */
interface SectionForm {
  labelZh: string;
  labelEn: string;
  itemsZh: string;
  itemsEn: string;
}

/** 一个分组的表单态 */
interface GroupForm {
  id: string;
  titleZh: string;
  titleEn: string;
  sections: SectionForm[];
}

const FIELD =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none';
const LABEL = 'mb-1 block text-xs font-bold text-muted-foreground';

/** 多行文本域 ↔ 字符串数组的互转。空行一律丢弃，避免存进一堆空标签。 */
const toLines = (s: string): string[] =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
const fromLines = (xs: string[]): string => xs.join('\n');

/** 生成一个当前未被占用的分组 id（必须过 SLUG_RE：小写字母、数字、连字符） */
function nextId(existing: GroupForm[]): string {
  const used = new Set(existing.map((g) => g.id));
  let n = existing.length + 1;
  let id = `skill-group-${n}`;
  while (used.has(id)) {
    n += 1;
    id = `skill-group-${n}`;
  }
  return id;
}

const blankSection = (): SectionForm => ({ labelZh: '', labelEn: '', itemsZh: '', itemsEn: '' });

export default function SkillAdmin({ groups }: { groups: SkillGroupRecord[] }) {
  const { d, pick } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<GroupForm[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errText = (code: string) =>
    (d.admin.errors as Record<string, string>)[code] ?? d.admin.errors.generic;

  /** 打开面板：把库里的当前值铺成表单（双语都取出来，编辑时两边都能改） */
  const open = () => {
    setForm(
      groups.map((g) => ({
        id: g.id,
        titleZh: g.title.zh,
        titleEn: g.title.en,
        sections: g.sections.map((s) => ({
          labelZh: s.label.zh,
          labelEn: s.label.en,
          itemsZh: fromLines(s.items.map((i) => i.zh)),
          itemsEn: fromLines(s.items.map((i) => i.en)),
        })),
      })),
    );
    setError(null);
  };

  /** 改某个分组的某个字段 */
  const patchGroup = (gi: number, patch: Partial<GroupForm>) =>
    setForm((f) => (f ? f.map((g, i) => (i === gi ? { ...g, ...patch } : g)) : f));

  /** 改某个分组里某个小节 */
  const patchSection = (gi: number, si: number, patch: Partial<SectionForm>) =>
    setForm((f) =>
      f
        ? f.map((g, i) =>
            i === gi ? { ...g, sections: g.sections.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : g,
          )
        : f,
    );

  /** 分组上移 / 下移。数组顺序就是页面顺序（保存时按下标写 sort），所以换个位置即可 */
  const move = (gi: number, delta: number) =>
    setForm((f) => {
      if (!f) return f;
      const to = gi + delta;
      if (to < 0 || to >= f.length) return f;
      const next = [...f];
      const [item] = next.splice(gi, 1);
      next.splice(to, 0, item);
      return next;
    });

  const addGroup = () =>
    setForm((f) => {
      if (!f) return f;
      return [...f, { id: nextId(f), titleZh: '', titleEn: '', sections: [blankSection()] }];
    });

  const removeGroup = (gi: number) =>
    setForm((f) => (f ? f.filter((_, i) => i !== gi) : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 条目在这里才拆成数组：文本域里的空行由 toLines 丢掉
        body: JSON.stringify(
          form.map((g) => ({
            id: g.id,
            titleZh: g.titleZh,
            titleEn: g.titleEn,
            sections: g.sections.map((s) => ({
              labelZh: s.labelZh,
              labelEn: s.labelEn,
              itemsZh: toLines(s.itemsZh),
              itemsEn: toLines(s.itemsEn),
            })),
          })),
        ),
      });
      const data = (await res.json()) as { ok?: boolean; code?: string };
      if (!data.ok) {
        setError(errText(data.code ?? 'generic'));
        return;
      }
      setForm(null);
      router.refresh();
    } catch {
      setError(errText('network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Pencil size={14} aria-hidden="true" />
        <span>{d.admin.editSkills}</span>
      </button>

      {form && (
        <EditorPanel
          title={d.admin.editSkills}
          onClose={() => setForm(null)}
          footer={
            <>
              {error && <span className="mr-auto text-xs font-semibold text-destructive">{error}</span>}
              <button
                type="button"
                onClick={() => setForm(null)}
                className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                {d.admin.cancel}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? d.admin.saving : d.admin.save}
              </button>
            </>
          }
        >
          <p className="mb-4 text-xs leading-relaxed text-muted-foreground">{d.admin.skillsHint}</p>

          <div className="space-y-4">
            {form.map((g, gi) => (
              <div key={g.id} className="rounded-lg border border-border bg-background/60 p-3 sm:p-4">
                {/* 分组头：序号 + 上下移 + 删除 */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    {d.admin.skillGroup} {gi + 1}
                  </span>
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(gi, -1)}
                      disabled={gi === 0}
                      aria-label={d.admin.moveUp}
                      title={d.admin.moveUp}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(gi, 1)}
                      disabled={gi === form.length - 1}
                      aria-label={d.admin.moveDown}
                      title={d.admin.moveDown}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGroup(gi)}
                      aria-label={d.admin.delete}
                      title={d.admin.delete}
                      className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-border text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label>
                    <span className={LABEL}>{d.admin.skillTitleZh}</span>
                    <input
                      className={FIELD}
                      value={g.titleZh}
                      placeholder={pick({ zh: '例如：大模型开发', en: 'e.g. LLM development' })}
                      onChange={(e) => patchGroup(gi, { titleZh: e.target.value })}
                    />
                  </label>
                  <label>
                    <span className={LABEL}>{d.admin.skillTitleEn}</span>
                    <input
                      className={FIELD}
                      value={g.titleEn}
                      onChange={(e) => patchGroup(gi, { titleEn: e.target.value })}
                    />
                  </label>
                </div>

                {/* 小节 */}
                <div className="mt-3 space-y-3">
                  {g.sections.map((s, si) => (
                    <div key={si} className="rounded-lg border border-border/70 bg-card p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label>
                          <span className={LABEL}>{d.admin.sectionLabelZh}</span>
                          <input
                            className={FIELD}
                            value={s.labelZh}
                            onChange={(e) => patchSection(gi, si, { labelZh: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className={LABEL}>{d.admin.sectionLabelEn}</span>
                          <input
                            className={FIELD}
                            value={s.labelEn}
                            onChange={(e) => patchSection(gi, si, { labelEn: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className={LABEL}>{d.admin.itemsZh}</span>
                          <textarea
                            className={`${FIELD} min-h-[96px] resize-y font-mono text-[13px] leading-relaxed`}
                            value={s.itemsZh}
                            onChange={(e) => patchSection(gi, si, { itemsZh: e.target.value })}
                          />
                        </label>
                        <label>
                          <span className={LABEL}>{d.admin.itemsEn}</span>
                          <textarea
                            className={`${FIELD} min-h-[96px] resize-y font-mono text-[13px] leading-relaxed`}
                            value={s.itemsEn}
                            onChange={(e) => patchSection(gi, si, { itemsEn: e.target.value })}
                          />
                        </label>
                      </div>
                      {g.sections.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            patchGroup(gi, { sections: g.sections.filter((_, j) => j !== si) })
                          }
                          className="mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-destructive"
                        >
                          <Trash2 size={12} aria-hidden="true" />
                          {d.admin.removeSection}
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => patchGroup(gi, { sections: [...g.sections, blankSection()] })}
                  className="mt-3 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-accent"
                >
                  <Plus size={13} aria-hidden="true" />
                  {d.admin.addSection}
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addGroup}
            className="mt-4 inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3.5 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:text-accent"
          >
            <Plus size={15} aria-hidden="true" />
            {d.admin.addGroup}
          </button>
        </EditorPanel>
      )}
    </>
  );
}
