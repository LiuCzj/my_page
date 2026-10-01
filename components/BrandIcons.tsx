'use client';

/**
 * 五个联系方式的品牌图标（内联 SVG，不引用任何图片文件）。
 *
 * 【为什么用内联 SVG 而不是 logo 图片】
 * 官方 logo 包要走网络下载、有版权与体积问题；更要紧的是多为白底 PNG，
 * 深色模式下白底方块会糊成一片。内联 SVG 用 currentColor / fill-accent /
 * fill-background 三个 token，深浅两套主题各自成立，颜色跟 globals.css 单一来源走。
 *
 * 【形状对应关系】
 * GitHub  → 章鱼猫 invertocat 轮廓（lucide-react 的官方形状描线）
 * CSDN    → CSDN 的 favicon 形态：圆角方块 + 反白「C」
 * 知乎    → 知乎的 app 图标形态：圆角方块 + 反白「知」
 * 微信    → 微信的双气泡（大气泡带两眼 + 小气泡带两眼）
 * 邮箱    → 信封描线（lucide-react Mail）
 *
 * 【配色取舍】CSDN 官方方块是红色、知乎官方方块是蓝色。本站主色是深蓝 + 白，
 * 两个都不搬 —— 一个红一个蓝，和旁边三枚灰线图标并排就是两种颜色在抢视线。
 * 现在五枚统一：底色用 currentColor，跟着按钮的 text-muted-foreground 走，
 * hover 时整枚一起变 accent；方块里的字用 fill-background 挖空。
 * 反白部分用 fill-background 而不是写死 white：明亮模式 background≈近白（深字配浅底块），
 * 暗黑模式 background≈深蓝黑（浅灰块配深字），两边都能看清。
 */

import { Github, Mail } from 'lucide-react';

/** 所有图标共用的入参 */
export interface BrandIconProps {
  /** 显示边长（px），默认 18（顶栏）。页脚用 20 */
  size?: number;
  /** 附加 class，通常由父级给 text-* 来控制颜色 */
  className?: string;
}

/** GitHub 章鱼猫描线图标 */
export function GitHubIcon({ size = 18, className = '' }: BrandIconProps) {
  return <Github size={size} className={className} aria-hidden="true" />;
}

/** 信封描线图标 */
export function MailIcon({ size = 18, className = '' }: BrandIconProps) {
  return <Mail size={size} className={className} aria-hidden="true" />;
}

/**
 * CSDN：圆角方块里一个反白 C。
 * 方块 fill="currentColor"、字母 fill-background，两者都随主题与 hover 走。
 */
export function CsdnIcon({ size = 18, className = '' }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1.5" y="3.5" width="21" height="17" rx="4" fill="currentColor" />
      <text
        x="12"
        y="16.6"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        className="fill-background"
      >
        C
      </text>
    </svg>
  );
}

/** 知乎：圆角方块里一个反白「知」，配色与 CSDN 那枚同一套处理 */
export function ZhihuIcon({ size = 18, className = '' }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="1.5" y="3.5" width="21" height="17" rx="4" fill="currentColor" />
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif"
        className="fill-background"
      >
        知
      </text>
    </svg>
  );
}

/**
 * 微信：一大一小两个气泡，每个气泡两只眼睛。
 * 气泡用 currentColor（跟随按钮的 text-* 类，hover 时一起变 accent）；
 * 眼睛用 fill-background 挖空，保证任何主题下眼睛都是「洞」而不是糊在一起。
 */
export function WechatIcon({ size = 18, className = '' }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      {/* 大气泡：主体椭圆 + 左下方尾巴 */}
      <path
        d="M9.2 3.2c-4.1 0-7.4 2.7-7.4 6 0 1.9 1.1 3.6 2.8 4.7l-.7 2.2 2.5-1.3c.9.3 1.9.4 2.8.4h.5a5.4 5.4 0 0 1-.2-1.5c0-3.2 3.1-5.7 6.9-5.7h.6c-.6-2.7-3.5-4.8-7-4.8zM6.5 8.4a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9zm5.3 0a.95.95 0 1 1 0-1.9.95.95 0 0 1 0 1.9z"
        fill="currentColor"
      />
      {/* 小气泡：右下方主体 + 尾巴，两只眼睛同样挖空 */}
      <path
        d="M22.2 14.1c0-2.7-2.6-4.9-5.8-4.9s-5.8 2.2-5.8 4.9 2.6 4.9 5.8 4.9c.7 0 1.4-.1 2-.3l2 1-.5-1.7c1.4-1 2.3-2.5 2.3-3.9zm-7.7-.8a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zm3.9 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6z"
        fill="currentColor"
      />
      {/* 眼睛挖空层：用 background token 盖回底色 */}
      <circle cx="6.5" cy="7.45" r=".95" className="fill-background" />
      <circle cx="11.8" cy="7.45" r=".95" className="fill-background" />
      <circle cx="14.5" cy="13.3" r=".8" className="fill-background" />
      <circle cx="18.4" cy="13.3" r=".8" className="fill-background" />
    </svg>
  );
}
