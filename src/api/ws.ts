// WebSocket 事件总线：接收后端推送的生成/运行/录制/智能体进度，支持取消。
const base = import.meta.env.DEV ? `ws://${location.host}/ws` : 'ws://127.0.0.1:4123/ws';

type Handler = (msg: any) => void;

class WSHub {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private connecting = false;

  private connect() {
    if (this.ws || this.connecting) return;
    this.connecting = true;
    this.ws = new WebSocket(base);
    this.ws.onopen = () => {
      this.connecting = false;
    };
    this.ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handlers.forEach((h) => h(msg));
      } catch {
        /* 忽略非法消息 */
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
      this.connecting = false;
      setTimeout(() => this.connect(), 1500); // 自动重连
    };
    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    this.connect();
    return () => this.handlers.delete(handler);
  }

  send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  cancel(jobId: string) {
    this.send({ type: 'cancel', jobId });
  }
}

export const ws = new WSHub();
