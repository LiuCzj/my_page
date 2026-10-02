'use client';

/**
 * 页尾，三件事：
 *   ① 上面一个「打个招呼 👋」+ 一颗实心按钮 —— 点它弹出邮箱联系方式
 *   ② 中间三栏：左边是谁 + 一句话 / 中间是页内导航（含打开数字分身）/ 右边是五个联系入口
 *   ③ 底下版权行
 *
 * 【底部那团柔光】页面收尾的一点温度。用 --accent（紫）
 * 压到 0.14 的一层径向渐变，pointer-events-none，不挡下面任何点击。
 *
 * 【右栏为什么不用现成的 SocialLinks】SocialLinks 是「一排纯图标」，
 * 顶栏和磁贴区那种横排要的就是它。这一栏要的是「图标 + 名字」竖排，
 * 所以直接用同一批 BrandIcons 自己排，交互口径保持一致：
 * 外链一律 target=_blank + rel=noopener noreferrer，微信和邮箱走父组件的弹窗。
 */

import { useState } from 'react';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import { CsdnIcon, GitHubIcon, MailIcon, WechatIcon, ZhihuIcon } from './BrandIcons';
import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { useTwinChat } from '@/lib/twin-chat-context';

export default function Footer() {
  const { d, pick, fill } = useI18n();
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const { openChat } = useTwinChat();
  const currentYear = new Date().getFullYear();
  const { github, csdn, zhihu, wechat, email } = site.contact;

  /**
   * 一栏里的一行：图标 + 名字。外链和按钮共用同一套排版。
   * 【min-h-[44px] 不是给桌面看的，是给手指留的】文字链接本身只有 20 来像素高，
   * 在手机上就是「要点很准才点得到」。全站可点元素最短边 ≥44px 这条规矩，
   * 页尾这两栏不能例外。
   */
  const row =
    'inline-flex min-h-[44px] items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-accent visited:text-muted-foreground';
  const label = 'font-medium';

  return (
    <>
      <footer className="relative mt-16 overflow-hidden border-t border-border bg-card/40">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-[-150px] h-[280px]"
          style={{
            background:
              'radial-gradient(58% 100% at 50% 100%, hsl(var(--accent) / 0.14), transparent 70%)',
          }}
        />

        <div className="relative mx-auto max-w-5xl px-4">
          {/* ──  打个招呼 ─────────────────────────────── */}
          <div className="flex flex-col items-center py-14 text-center">
            <p className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {d.footer.greet}
              <span aria-hidden="true" className="ml-2 inline-block align-middle">👋</span>
            </p>
            {/* 这颗按钮是「用邮箱联系我」，不是开聊天窗。
                走的是站里既有的邮箱弹窗（可复制的地址），不直接 mailto：
                直接 mailto 会在没装邮件客户端的设备上点了没反应，
                而且弹窗里那个地址还能复制。聊天窗的入口在左栏「问分身」。 */}
            <button
              type="button"
              onClick={() => setModal('email')}
              aria-haspopup="dialog"
              className="mt-7 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MailIcon size={15} />
              {d.footer.greetCta}
            </button>
          </div>

          {/* ── ② 三栏 ────────────────────────────────── */}
          <div className="grid gap-10 border-t border-border py-12 sm:grid-cols-[1.35fr_0.8fr_1fr] sm:gap-8">
            {/* 左：是谁。这里不放头像 —— 首屏已经有一枚圆头像，
                同一张脸在页尾再出现一次只是重复。 */}
            <div>
              <p className="text-base font-bold tracking-tight text-foreground">
                {site.identity.name.replace(site.identity.nameAccent, '')}
                <span className="text-accent">{site.identity.nameAccent}</span>
              </p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {/* 这句直接用 config 里他自己写的 tagline，不另造一句页脚专用文案 ——
                    同一句自我介绍在两处出现两个版本，早晚对不上 */}
                {pick(site.identity.tagline)}
              </p>
            </div>

            {/* 中：页内导航 */}
            <nav aria-label={d.footer.navigate}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
                {d.footer.navigate}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  <a href="/" className={`${row} visited:text-muted-foreground`}>
                    <span className={label}>{d.nav.home}</span>
                  </a>
                </li>
                <li>
                  <a href="/#projects" className={`${row} visited:text-muted-foreground`}>
                    <span className={label}>{d.nav.projects}</span>
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={openChat}
                    aria-haspopup="dialog"
                    className={`${row} cursor-pointer bg-transparent p-0 text-left`}
                  >
                    <span className={label}>{d.nav.chat}</span>
                  </button>
                </li>
              </ul>
            </nav>

            {/* 右：联系入口 */}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
                {d.footer.connect}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => setModal('email')}
                    aria-haspopup="dialog"
                    className={`${row} w-full cursor-pointer bg-transparent p-0 text-left`}
                  >
                    <MailIcon size={16} />
                    <span className={label}>{pick(email.label)}</span>
                  </button>
                </li>
                {github.url && (
                  <li>
                    <a href={github.url} target="_blank" rel="noopener noreferrer" className={row}>
                      <GitHubIcon size={16} />
                      <span className={label}>GitHub</span>
                    </a>
                  </li>
                )}
                {csdn.url && (
                  <li>
                    <a href={csdn.url} target="_blank" rel="noopener noreferrer" className={row}>
                      <CsdnIcon size={16} />
                      <span className={label}>{pick(csdn.label)}</span>
                    </a>
                  </li>
                )}
                {zhihu.url && (
                  <li>
                    <a href={zhihu.url} target="_blank" rel="noopener noreferrer" className={row}>
                      <ZhihuIcon size={16} />
                      <span className={label}>{pick(zhihu.label)}</span>
                    </a>
                  </li>
                )}
                <li>
                  <button
                    type="button"
                    onClick={() => setModal('wechat')}
                    aria-haspopup="dialog"
                    className={`${row} w-full cursor-pointer bg-transparent p-0 text-left`}
                  >
                    <WechatIcon size={16} />
                    <span className={label}>{pick(wechat.label)}</span>
                  </button>
                </li>
              </ul>
            </div>
          </div>

          {/* ── ③ 版权行 ───────────────────────────────── */}
          <div className="border-t border-border py-6 text-center text-xs text-muted-foreground">
            {fill(d.footer.rights, { year: currentYear })}
          </div>
        </div>
      </footer>

      <ContactModal
        open={modal !== null}
        variant={modal ?? 'notice'}
        onClose={() => setModal(null)}
      />
    </>
  );
}
