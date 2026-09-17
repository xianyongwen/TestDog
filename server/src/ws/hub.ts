import type { WebSocket } from 'ws';

/** 服务端固定文案的 i18n 载荷：key 为前端词条全名（如 genStatus.loginLoaded），params 为插值参数。
 *  携带 i18n 的事件必须同时带原文 message/result（旧客户端展示与落库兜底）。 */
export interface GenMsgI18n {
  key: string;
  params?: Record<string, string | number>;
}

/** 服务端 -> 客户端的消息（均带 jobId 关联，前端按 jobId 过滤）。 */
export interface ServerMsg {
  type: string;
  jobId?: string;
  i18n?: GenMsgI18n;
  [key: string]: unknown;
}

interface ClientMsg {
  type: 'cancel';
  jobId: string;
}

const clients = new Set<WebSocket>();
const cancelHandlers = new Map<string, () => void>();

export function addClient(ws: WebSocket) {
  clients.add(ws);
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as ClientMsg;
      if (msg.type === 'cancel' && msg.jobId) {
        const handler = cancelHandlers.get(msg.jobId);
        if (handler) {
          handler();
        }
      }
    } catch {
      // 忽略非法消息
    }
  });
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
}

export function publish(msg: ServerMsg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
}

export function registerCancel(jobId: string, handler: () => void) {
  cancelHandlers.set(jobId, handler);
}

export function unregisterCancel(jobId: string) {
  cancelHandlers.delete(jobId);
}
