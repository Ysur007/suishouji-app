/**
 * 行内确认条：替换「按钮文字变成确认」的做法。
 *
 * 危险动作要先把后果说出来，再给「取消 / 确认」两个对称的出口；
 * 只在行下面展开，不弹浮层——操作是局部的，打断越少越好。
 */

export function ConfirmBar({
  text,
  confirmLabel = '确认',
  extra,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirmLabel?: string;
  /** 附加动作，比如「退出并清除本机」 */
  extra?: { label: string; onClick: () => void };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirmBar">
      <div className="confirmBar__text">{text}</div>
      <div className="confirmBar__actions">
        <button className="btn btn--ghost" onClick={onCancel}>
          取消
        </button>
        {extra ? (
          <button className="btn btn--ghost btn--danger" onClick={extra.onClick}>
            {extra.label}
          </button>
        ) : null}
        <button className="btn btn--danger btn--solid" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
