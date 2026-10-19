/** 背景音乐取用口。 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { site } from '@/config/site';
import { verifyAudioToken } from '@/lib/audio-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 音频目录，可用 AUDIO_DIR 覆盖 */
const AUDIO_DIR = process.env.AUDIO_DIR?.trim() || 'private/audio';

/** 文件名白名单，堵路径穿越 */
const FILE_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/i;

/**
 * 解析音频文件绝对路径。
 * @returns 配置不合法时返回 null
 */
function resolveAudioFile(): string | null {
  const name = path.basename(site.music.src || '');
  if (!name || !FILE_NAME_RE.test(name)) return null;

  const dir = path.resolve(process.cwd(), AUDIO_DIR);
  const full = path.resolve(dir, name);
  // 加 path.sep 避免 /a/bc 被 /a/b 前缀误判为通过
  if (full !== path.join(dir, name) || !full.startsWith(dir + path.sep)) return null;
  return full;
}

/** 请求是否来自本站页面：优先 Sec-Fetch-Site，缺失时回退 Referer / Origin */
function isSameOrigin(req: Request): boolean {
  const host = req.headers.get('host');
  if (!host) return false;

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'same-origin' || fetchSite === 'same-site';

  const ref = req.headers.get('referer') ?? req.headers.get('origin') ?? '';
  if (!ref) return false;
  try {
    return new URL(ref).host === host;
  } catch {
    return false;
  }
}

function forbidden(): Response {
  return new Response('forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
}

/** @param headOnly HEAD 请求：只回头，不带体 */
async function handle(req: Request, headOnly: boolean): Promise<Response> {
  if (!isSameOrigin(req)) return forbidden();

  const token = new URL(req.url).searchParams.get('t') ?? '';
  if (!verifyAudioToken(token)) return forbidden();

  const file = resolveAudioFile();
  if (!file) return new Response('not found', { status: 404 });

  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch {
    console.warn('[audio] 音频文件读取失败，检查 AUDIO_DIR 与文件名');
    return new Response('not found', { status: 404 });
  }

  const total = buf.length;
  const baseHeaders: Record<string, string> = {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    // private：只让访客自己的浏览器缓存。别用 no-store，会让每次页面加载重拉 4.4 MB
    'Cache-Control': 'private, max-age=3600',
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
  };

  // Range：<audio> 拉元数据、拖进度条都靠它
  const range = req.headers.get('range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }

    // 只给起点（bytes=1000-）时终点默认到文件末尾
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : total - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }

    const last = Math.min(end, total - 1);
    const slice = buf.subarray(start, last + 1);
    return new Response(headOnly ? null : slice, {
      status: 206,
      headers: {
        ...baseHeaders,
        'Content-Range': `bytes ${start}-${last}/${total}`,
        'Content-Length': String(slice.length),
      },
    });
  }

  return new Response(headOnly ? null : buf, {
    status: 200,
    headers: { ...baseHeaders, 'Content-Length': String(total) },
  });
}

export async function GET(req: Request): Promise<Response> {
  return handle(req, false);
}

export async function HEAD(req: Request): Promise<Response> {
  return handle(req, true);
}
