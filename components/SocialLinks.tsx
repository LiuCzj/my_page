'use client';

/**
 * 五个联系方式图标按钮，顶栏 / 页脚 / 首页「连接」磁贴共用同一份实现。
 *
 * 【顺序】GitHub → CSDN → 知乎 → 微信公众号 → 邮箱。
 * 【交互】前三者是外链（新窗口打开）；微信**悬停出二维码**、点击仍可打开弹窗；邮箱弹联系方式。
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
  /** 图标边长（px） */
  size?: number;
  /** 单个按钮的 class，顶栏用它控制 44px 触控区，页脚用它加大间距 */
  itemClassName?: string;
  /** 由父组件持有弹窗状态：点击微信/邮箱/未配置链接时告诉父组件开哪一种 */
  onOpenModal: (variant: ContactModalVariant) => void;
  /**
   * 二维码浮层的落位。
   *
   * · `'left'`（默认）= 贴图标左侧、垂直居中 —— 给**卡片里的磁贴**用。
   *   磁贴的图标行在卡片中部，垂直居中的浮层整块落在卡片内。
   * · `'below'` = 贴图标下方往下挂 —— **顶栏必须用这个**。
   *
   * 【为什么顶栏不能用 'left'】2026-10-05 实测（CDP 量出来的数字）：
   * 浮层高 153px、图标在 56px 的顶栏里垂直居中 → 浮层顶边落在 y = -48，
   * **上面 48px 跑到视口外**，其中包含二维码图顶部 39px（图共 112px）——
   * 站长看到的「二维码被挡住了」就是这个：不是被别的元素盖住，是被屏幕顶边切掉。
   * 顶栏没有 overflow-hidden（当初排查时确认过），所以问题不在裁剪，在**视口边界**。
   */
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

  /**
   * 外链基础样式：颜色走 token，hover 提到 accent，深浅模式都成立。
   *
   * · visited: 那一条是必须的 —— Chrome 会把点过的链接换成它自己的 visited 颜色，
   *   优先级高到能盖住作者甚至内联声明（实测过），不处理的话：
   *   访客第二次进来时，他点过的 GitHub / CSDN / 知乎图标会变成几乎看不见的灰白块。
   * · hover:scale-[1.18] ——「鼠标停上去要放大」是站长明确要的，按钮同样生效，观感才一致。
   *   用 transform 缩放而不是改字号：不触发重排，图标也不会在缩放途中糊掉。
   */
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
    /*
      为什么整组外面要包一层 data-cursor-emoji=""（空值）：
      首页「连接」那块磁贴本身带 data-cursor-emoji="🔗"，鼠标进卡片会把系统箭头换成 🔗。
      但鼠标一旦停在**联系方式图标上**，那枚 🔗 正好压在图标上把它遮住（站长反馈过）。
      CustomCursor 用的是 closest('[data-cursor-emoji]') —— 找最近的带该属性的祖先，
      而空字符串是「有属性、没有表情」，于是这层之内表情光标直接消失，卡片别处照旧显示 🔗。
      className="contents" 让它不产生盒子（display: contents），父级 flex 布局完全不变 ——
      它不是布局改动，纯粹是给光标组件一个标记。
    */
    <span className="contents" data-cursor-emoji="">
      {linkItem(github.url, `GitHub${github.handle ? ` · ${github.handle}` : ''}`, <GitHubIcon size={size} />)}
      {linkItem(csdn.url, pick(csdn.label), <CsdnIcon size={size} />)}
      {linkItem(zhihu.url, pick(zhihu.label), <ZhihuIcon size={size} />)}

      {/*
        微信公众号：鼠标停上去直接出二维码。
        两条通道并存 —— 触屏没有 hover，点一下仍然打开原来的弹窗。

        【为什么用纯 CSS 的 group-hover，而不是 React 的 onMouseEnter + Portal】
        试过 Portal 方案（state + createPortal 到 body），在自动化环境里 React 的
        onMouseEnter 死活不触发，浮层永远不渲染；而祖先的 CSS :hover 是稳的。
        CSS 方案唯一的问题是浮层会被卡片裁掉 —— 那个交给 globals.css 里一条 :has() 规则解决
        （悬停这枚图标期间临时放开卡片的 overflow）。少一层状态，也就少一处会失灵的地方。

        【为什么去掉了 title 属性】浏览器会为 title 画原生提示框（"微信公众号"），
        它会和二维码浮层抢同一块地方（站长的截图里正是原生提示盖着、二维码看不见）。
        名字已经写在浮层里了，无障碍信息交给 aria-label。
      */}
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

        {/*
          二维码浮层。
          【位置】两种落位，由 qrPlacement 决定，理由见 Props 上的说明：
          · 'left'  → 图标左侧、垂直居中。磁贴用（整块落在卡片内）。
          · 'below' → 图标下方往下挂。**顶栏用**（垂直居中会被视口顶边切掉二维码的上半截）。

          invisible + opacity-0 而不是 display:none：保留淡入过渡，鼠标扫过时不会硬弹出来。
          pointer-events-none：浮层绝不抢点击，鼠标始终在按钮上，不会「一移开就闪」。
        */}
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
