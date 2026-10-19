/** 管理端：Markdown → HTML 预览。 */

import { NextResponse } from 'next/server';
import { requireAdmin, readJson } from '@/lib/admin-guard';
import { renderMarkdown } from '@/lib/markdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 把提交上来的内容渲染成 HTML。
 *
 * 支持两种请求体：
 *   `{ blocks: string[] }` —— **按块批量渲染**，返回 `{ ok, html: string[] }`。
 *     单栏编辑器要「光标所在那一块显示源码、其余块显示渲染结果」，
 *     就必须拿到**每一块各自**的 HTML。整篇渲染出来的一整串 HTML
 *     没法可靠地切回块（一个块可能产出多个顶层元素，也可能没有）。
 *   `{ markdown: string }` —— 整篇一次渲染，返回 `{ ok, html: string }`。保留给其它调用方。
 *
 * @param request HTTP 请求
 * @returns 渲染结果；非管理员 / 参数非法时返回对应错误码
 */
export async function POST(request: Request): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const raw = await readJson(request);
  const body = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  if (Array.isArray(body.blocks)) {
    // 有一个不是字符串就整体拒绝：过滤掉的话下标会错位，渲染结果会张冠李戴
    if (body.blocks.some((b) => typeof b !== 'string')) {
      return NextResponse.json({ ok: false, code: 'bad_request' }, { status: 400 });
    }
    const html = await Promise.all((body.blocks as string[]).map((b) => renderMarkdown(b)));
    return NextResponse.json({ ok: true, html });
  }

  if (typeof body.markdown !== 'string') {
    return NextResponse.json({ ok: false, code: 'bad_request' }, { status: 400 });
  }
  const html = await renderMarkdown(body.markdown);
  return NextResponse.json({ ok: true, html });
}
