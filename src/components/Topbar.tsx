import type { ReactNode } from 'react';
import { IconChevron } from './Icons';

interface TopbarProps {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  /** 传了就说明标题可以点（用于切换空间） */
  onTitleClick?: () => void;
}

/**
 * 记录页（记录 / 时间线 / 空间 / 文件夹）的页头。
 *
 * 以前这里是另一套头部：居中一条、28px 大标题，和整理 / 对话 / 我的
 * 的左对齐页头并排切着看像两个应用。现在统一走 `.aiHead`——
 * 标题与说明贴左、操作贴右，字号与内边距一致。
 *
 * 保留的唯一差异是 `.aiHead--record`：这页右侧只有图标按钮（没有引擎标签那种长文本），
 * 手机上没必要像对话页那样折成两行，挤一行更省高度。
 */
export function Topbar({ title, sub, actions, onTitleClick }: TopbarProps) {
  return (
    <header className="aiHead aiHead--record">
      <div className="aiHead__main">
        <h1
          className={`aiHead__title${onTitleClick ? ' aiHead__title--btn' : ''}`}
          onClick={onTitleClick}
          role={onTitleClick ? 'button' : undefined}
          tabIndex={onTitleClick ? 0 : undefined}
          onKeyDown={(e) => {
            if (!onTitleClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onTitleClick();
            }
          }}
        >
          {title}
          {onTitleClick ? (
            <IconChevron className="aiHead__title-chev" width={18} height={18} />
          ) : null}
        </h1>
        {sub ? <div className="aiHead__desc aiHead__desc--row">{sub}</div> : null}
      </div>
      {actions ? <div className="aiHead__side">{actions}</div> : null}
    </header>
  );
}
