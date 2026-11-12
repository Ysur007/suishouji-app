/**
 * 「这块要登录」的统一提示。
 *
 * 以前未登录点进整理/对话，看到的是接口报的「请先登录」或者干脆空白一片——
 * 用户不知道下一步该去哪。现在固定给一句为什么 + 一个能点的入口，
 * 登录完回到刚才那个页面（`?next=`），不用重新找路。
 */

import { navigate } from '../lib/router';
import { IconUser } from './Icons';

export function LoginGate({
  title,
  desc,
  benefits = ['多设备同步', '群组共享', 'AI 整理与对话'],
  compact = false,
}: {
  title: string;
  desc: string;
  benefits?: string[];
  compact?: boolean;
}) {
  const go = () => {
    const next = `${location.pathname}${location.search}`;
    navigate(`/login?next=${encodeURIComponent(next)}`);
  };

  return (
    <div className="loginGate" data-compact={compact || undefined}>
      <div className="loginGate__mark">
        <IconUser width={18} height={18} />
      </div>
      <div className="loginGate__title">{title}</div>
      <div className="loginGate__desc">{desc}</div>
      <button className="btn btn--primary loginGate__btn" onClick={go}>
        去登录
      </button>
      <div className="loginGate__benefits">
        {benefits.map((b) => (
          <span key={b}>{b}</span>
        ))}
      </div>
    </div>
  );
}
