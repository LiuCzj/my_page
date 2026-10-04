'use client';

/**
 * 页尾，三件事：
 *   ① 上面一个「打个招呼 👋」+ 一颗实心按钮 —— 点它弹出邮箱联系方式
 *   ② 中间三栏：左边是谁 + 一句话 / 中间是页内导航（含打开数字分身）/ 右边是五个联系入口
 *   ③ 底下版权行
 *
 * 【底部那团柔光】页面收尾的一点温度。用 --accent（蓝）
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
  const { open, toggleChat } = useTwinChat();
  const currentYear = new Date().getFullYear();
  const { github, csdn, zhihu, wechat, email } = site.contact;

  /**
   * 一栏里的一行：图标 + 名字。外链和按钮共用同一套排版。
   * 【min-h-[44px] 不是给桌面看的，是给手指留的】文字链接本身只有 20 来像素高，
   * 在手机上就是「要点很准才点得到」。全站可点元素最短边 ≥44px 这条规矩，
   * 页尾这两栏不能例外。
   */
  /**
   * 一栏里的一行：图标 + 名字。外链和按钮共用同一套排版。
   *
   * 【为什么必须有 w-full】原来只写了 inline-flex，宽度就等于文字本身的宽度 ——
   * 手机上「首页」这两个字量出来只有 28px 宽，手指很难点中。
   * 这是移动端审计实测出来的（不是凭直觉），加上 w-full 之后
   * 整行都成为可点区域：高度 44px、宽度撑满整列。
   * 行内文字链接可以窄，但页脚这几行是列表项，用户会当成整行可点。
   */
  const row =
    'inline-flex min-h-[44px] w-full items-center gap-2.5 text-sm text-muted-foreground transition-[color,transform] duration-200 hover:translate-x-1 hover:text-accent visited:text-muted-foreground';
  /**
   * 行内文本加粗：原版 font-medium 在 16px 字号下读着像普通正文，
   * 访客扫读时容易漏掉。提到 font-semibold 与导航项同级，
   * 「左中右」三栏字重一致，整页的字体分级才稳。
   */
  const label = 'font-semibold';

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
          {/* ──  打个招呼 ───────────────────────────────
              py-10 而不是 py-14：手机上这一屏只有一句标题加一颗按钮，
              56px 的上下留白会把页尾撑到要多滚一屏才看得全。
              sm 以上回到 56px，页尾才有收尾该有的呼吸感。 */}
          <div className="flex flex-col items-center py-10 text-center sm:py-14">
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
              className="press mt-7 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <MailIcon size={15} />
              {d.footer.greetCta}
            </button>
          </div>

          {/* ── ② 三栏 ──────────────────────────────────
              【移动端改成两列】
              sm 以下：`grid-cols-2`，「是谁」跨满两列占第一行，
              「导航」和「联系」并排占第二行 —— 页尾这两块性质相同（都是一列链接），
              在手机上竖着堆成两屏才滚得完，并排才是一屏能看完的密度。
              sm 以上：回到原来的 1.35fr / 0.8fr / 1fr 三栏，
              「是谁」那句 tagline 需要横向空间，三栏里它才有地方铺开。 */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 border-t border-border py-12 sm:grid-cols-[1.35fr_0.8fr_1fr] sm:gap-8">
            {/* 左：是谁。这里不放头像 —— 首屏已经有一枚圆头像，
                同一张脸在页尾再出现一次只是重复。
                col-span-2：手机上它独占第一行，sm 以上回到占一列。 */}
            <div className="col-span-2 sm:col-span-1">
              <p className="text-base font-bold tracking-tight text-foreground">
                {site.identity.name.replace(site.identity.nameAccent, '')}
                <span className="text-brand">{site.identity.nameAccent}</span>
              </p>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                {/* 这句直接用 config 里他自己写的 tagline，不另造一句页脚专用文案 ——
                    同一句自我介绍在两处出现两个版本，早晚对不上 */}
                {pick(site.identity.tagline)}
              </p>
            </div>

            {/* 中：页面导航。站点从单页扩成三页后，项目改指真路由 /projects，
                并补上笔记 /notes。这里用的是原生 <a> 而不是 next/link ——
                现状如此，本次只同步 href，不动跳转方式以缩小改动面。 */}
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
                  <a href="/projects" className={`${row} visited:text-muted-foreground`}>
                    <span className={label}>{d.nav.projects}</span>
                  </a>
                </li>
                <li>
                  <a href="/notes" className={`${row} visited:text-muted-foreground`}>
                    <span className={label}>{d.nav.notes}</span>
                  </a>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={toggleChat}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    aria-label={open ? d.chat.close : d.nav.chat}
                    className={`${row} cursor-pointer bg-transparent p-0 text-left`}
                  >
                    <span className={label}>{open ? d.chat.close : d.nav.chat}</span>
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
