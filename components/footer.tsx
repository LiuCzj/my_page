'use client';

/**
 * 页脚。
 *
 * 联系方式图标复用顶栏同一份 SocialLinks + ContactModal，两处点击行为完全一致。
 *
 * 这里不放任何第三方托管商的外链：一是境外站点国内访问不稳，
 * 二是本站部署在自己的服务器上，挂一个用不上的链接没有意义。
 * 页脚只留一句话介绍、五个联系方式和版权行。
 */

import { useState } from 'react';
import SocialLinks from './SocialLinks';
import ContactModal, { type ContactModalVariant } from './ContactModal';
import { useI18n } from '@/lib/i18n';
import { site } from '@/config/site';

export default function Footer() {
  const { d, pick, fill } = useI18n();
  const [modal, setModal] = useState<ContactModalVariant | null>(null);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <footer className="mt-16 border-t border-border bg-card/40">
        <div className="mx-auto max-w-3xl px-4 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">{pick(site.identity.tagline)}</p>

          <div className="mt-4 flex items-center justify-center gap-1">
            <SocialLinks size={20} itemClassName="size-11" onOpenModal={setModal} />
          </div>

          <p className="mt-5 text-sm text-muted-foreground">
            {fill(d.footer.rights, { year: currentYear })}
          </p>
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
