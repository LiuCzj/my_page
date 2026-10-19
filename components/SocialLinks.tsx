'use client';

/** 五个联系方式图标按钮，顶栏 / 页脚 / 首页「连接」磁贴共用同一份实现。 */

import { site } from '@/config/site';
import { useI18n } from '@/lib/i18n';
import { CsdnIcon, GitHubIcon, MailIcon, WechatIcon, ZhihuIcon } from './BrandIcons';
import type { ContactModalVariant } from './ContactModal';

interface SocialLinksProps {
  /** 图标边长（px） */
  size?: number;
  /** 单个按钮的 class，顶栏用它控制 44px 触控区，页脚用它加大间距 */
  itemClassName?: string;
  /** 由父组件持有弹窗状态：点击微信/邮箱/未配置链接时告诉父组件开哪一种 */
  onOpenModal: (variant: ContactModalVariant) => void;
  /** 二维码浮层的落位。 */
  qrPlacement?: 'left' | 'below';
}

export default function SocialLinks({
  size = 20,
  itemClassName = '',
  onOpenModal,
  qrPlacement = 'left',
}: SocialLinksProps) {
  const { pick } = useI18n();
  const { github, csdn, zhihu, wechat, email } = site.contact;

  /** 外链基础样式：颜色走 token，hover 提到 accent，深浅模式都成立。 */
  const base =
    'inline-flex items-center justify-center rounded-lg text-muted-foreground transition hover:scale-[1.18] hover:text-accent visited:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
    /* 为什么整组外面要包一层 data-cursor-emoji=""（空值）。 */
    <span className="contents" data-cursor-emoji="">
      {linkItem(github.url, `GitHub${github.handle ? ` · ${github.handle}` : ''}`, <GitHubIcon size={size} />)}
      {linkItem(csdn.url, pick(csdn.label), <CsdnIcon size={size} />)}
      {linkItem(zhihu.url, pick(zhihu.label), <ZhihuIcon size={size} />)}

      {/* 微信公众号：鼠标停上去直接出二维码。 */}
      <span className="group/wechat relative inline-flex">
        <button
          type="button"
          data-wechat-qr=""
          onClick={() => onOpenModal('wechat')}
          aria-label={pick(wechat.label)}
          aria-haspopup="dialog"
          className={`${base} ${itemClassName} cursor-pointer`}
        >
          <WechatIcon size={size} />
        </button>

        {/* 二维码浮层。 */}
        {wechat.qrcode && (
          <span
            aria-hidden="true"
            className={`wechat-qr-panel pointer-events-none invisible absolute z-50 w-max rounded-xl border border-border bg-card p-2 text-center opacity-0 shadow-2xl transition-opacity duration-200 group-hover/wechat:visible group-hover/wechat:opacity-100 ${
              qrPlacement === 'below'
                ? 'top-full right-0 mt-2'
                : 'top-1/2 right-full mr-3 -translate-y-1/2'
            }`}
          >
            <img
              src={wechat.qrcode}
              alt=""
              width={112}
              height={112}
              loading="lazy"
              className="size-28 rounded-lg object-cover"
            />
            <span className="mt-1 block text-[11px] font-semibold text-card-foreground">
              {wechat.accountName}
            </span>
          </span>
        )}
      </span>

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
    </span>
  );
}
