'use client';

/**
 * 五个联系方式图标按钮，顶栏与页脚共用同一份实现。
 *
 * 【顺序】GitHub → CSDN → 知乎 → 微信公众号 → 邮箱。
 * 【交互】前三者是外链（新窗口打开）；微信弹二维码；邮箱弹联系方式。
 * 【安全】外链一律带 rel="noopener noreferrer"：只写 target="_blank" 的话，
 *   被打开的页面能通过 window.opener 反向操控本站标签页。
 * 【未配置状态】config/site.ts 里 url 为空时不跳外链，改成弹出「尚未配置」提示，
 *   避免链接没填好时把访客送到空白页或错误地址。
 */

import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { CsdnIcon, GitHubIcon, MailIcon, WechatIcon, ZhihuIcon } from './BrandIcons';
import type { ContactModalVariant } from './ContactModal';

interface SocialLinksProps {
  /** 图标边长 */
  size?: number;
  /** 单个按钮的 class，顶栏用它控制 44px 触控区，页脚用它加大间距 */
  itemClassName?: string;
  /** 由父组件持有弹窗状态：点击微信/邮箱/未配置链接时告诉父组件开哪一种 */
  onOpenModal: (variant: ContactModalVariant) => void;
}

export default function SocialLinks({
  size = 18,
  itemClassName = '',
  onOpenModal,
}: SocialLinksProps) {
  const { pick } = useI18n();
  const { github, csdn, zhihu, wechat, email } = site.contact;

  /** 外链基础样式：颜色走 token，hover 提到 accent，深浅模式都成立 */
  const base =
    'inline-flex items-center justify-center rounded-lg text-muted-foreground transition hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

  /** 一个带外链的图标按钮 */
  const linkItem = (href: string, label: string, icon: React.ReactNode) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        aria-label={label}
        className={`${base} ${itemClassName}`}
      >
        {icon}
      </a>
    ) : (
      // 尚未配置：仍可点，但只弹提示，不跳任何网址
      <button
        type="button"
        onClick={() => onOpenModal('notice')}
        title={label}
        aria-label={label}
        className={`${base} ${itemClassName} cursor-pointer`}
      >
        {icon}
      </button>
    );

  return (
    <>
      {linkItem(github.url, `GitHub${github.handle ? ` · ${github.handle}` : ''}`, <GitHubIcon size={size} />)}
      {linkItem(csdn.url, pick(csdn.label), <CsdnIcon size={size} />)}
      {linkItem(zhihu.url, pick(zhihu.label), <ZhihuIcon size={size} />)}

      <button
        type="button"
        onClick={() => onOpenModal('wechat')}
        title={pick(wechat.label)}
        aria-label={pick(wechat.label)}
        aria-haspopup="dialog"
        className={`${base} ${itemClassName} cursor-pointer`}
      >
        <WechatIcon size={size} />
      </button>

      <button
        type="button"
        onClick={() => onOpenModal('email')}
        title={pick(email.label)}
        aria-label={`${pick(email.label)} · ${email.address}`}
        aria-haspopup="dialog"
        className={`${base} ${itemClassName} cursor-pointer`}
      >
        <MailIcon size={size} />
      </button>
    </>
  );
}
