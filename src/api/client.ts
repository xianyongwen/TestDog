// 前端 HTTP 客户端。开发期经 Vite 代理同源访问后端；生产期直连 127.0.0.1:4123。
export const apiBase = import.meta.env.DEV ? '' : 'http://127.0.0.1:4123';
const base = apiBase;

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const maxAttempts = method === 'GET' ? 3 : 1; // 仅 GET 重试，避免 POST 重复
  const url = `${base}${path}`;
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  // 无 body 不带 json content-type，避免 Fastify 拒绝空 JSON 体；FormData 由浏览器自动带 multipart boundary，不能覆写
  if (init?.body && !(init.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers });
    } catch (e) {
      // 网络层失败（后端尚未就绪）：GET 退避重试
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }
      throw e;
    }
    const text = await res.text();
    if (!res.ok) throw new Error(text || `${res.status}`);
    return text ? JSON.parse(text) : (undefined as T);
  }
  throw new Error('请求失败');
}

export const http = {
  get: <T = any>(p: string) => api<T>(p),
  post: <T = any>(p: string, body?: any) => api<T>(p, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T = any>(p: string, body?: any) => api<T>(p, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(p: string, body?: any) => api<T>(p, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: <T = any>(p: string, body?: any) => api<T>(p, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  /** multipart 文件上传（FormData 不设 json content-type）。 */
  upload: <T = any>(p: string, body: FormData) => api<T>(p, { method: 'POST', body }),
};

// —— 插件管理（组件适配插件与预设）——
export const pluginsApi = {
  list: () => http.get('/api/plugins'),
  upload: (form: FormData) => http.upload('/api/plugins/upload', form),
  reupload: (id: string, form: FormData) => http.upload(`/api/plugins/${id}/file`, form),
  patch: (id: string, body: { description?: string }) => http.patch(`/api/plugins/${id}`, body),
  remove: (id: string) => http.del(`/api/plugins/${id}`),
  test: (id: string, url: string) => http.post(`/api/plugins/${id}/test`, { url }),
  presets: () => http.get('/api/plugin-presets'),
  /** 项目可用的插件语义动作词表（不传 projectId 时回落内置默认组合）。 */
  actions: (projectId?: string | null) =>
    http.get(`/api/plugin-actions${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
  createPreset: (body: { name: string; description?: string; pluginIds: string[] }) => http.post('/api/plugin-presets', body),
  updatePreset: (id: string, body: { name?: string; description?: string; pluginIds?: string[] }) => http.patch(`/api/plugin-presets/${id}`, body),
  removePreset: (id: string) => http.del(`/api/plugin-presets/${id}`),
};
