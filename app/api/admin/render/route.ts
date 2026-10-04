/**
 * 管理端：Markdown → HTML 预览。
 *
 * 【为什么预览要打服务端】编辑器的实时预览必须和「发布后访客看到的」一模一样。
 * 如果在浏览器里用另一个 Markdown 库渲染，两边对表格、代码块、链接的处理迟早会不一样 ——
 * 那种「预览好看、发布跑版」的落差最难查。所以预览直接复用 lib/markdown.ts 的同一条管线。
 *
 * 【为什么也要求管理员】它虽然只是渲染、不写数据，但会把任意 Markdown 变成 HTML 返回。
 * 不设权限的话，这个端点就成了一个公开的 Markdown 渲染服务（可被拿来刷 CPU）。
 */

import { NextResponse } from 'next/server';
import { requireAdmin, readJson } from '@/lib/admin-guard';
import { renderMarkdown } from '@/lib/markdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  const deny = await requireAdmin();
  if (deny) return deny;

  const raw = await readJson(request);
  const markdown = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).markdown : '';
  if (typeof markdown !== 'string') {
    return NextResponse.json({ ok: false, code: 'bad_request' }, { status: 400 });
  }

  const html = await renderMarkdown(markdown);
  return NextResponse.json({ ok: true, html });
}
