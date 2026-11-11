import type { Op } from './types';

/** 极小的操作总线：store 产生 Op，sync 负责发送。避免两个模块互相 import。 */

type Handler = (op: Op) => void;

const handlers = new Set<Handler>();

export function onOp(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function emitOp(op: Op) {
  for (const h of handlers) h(op);
}

/** 登录态变化（登录 / 退出 / 失效）时通知同步层重连或断开 */
type AuthHandler = () => void;
const authHandlers = new Set<AuthHandler>();

export function onAuthChange(handler: AuthHandler): () => void {
  authHandlers.add(handler);
  return () => authHandlers.delete(handler);
}

export function emitAuthChange() {
  for (const h of authHandlers) h();
}
