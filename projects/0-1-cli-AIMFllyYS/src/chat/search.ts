import * as https from 'https';
import { SearchResult, WebSearchResponse } from '../types';

// Shared agent for search API (keep-alive)
const searchAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2,
  maxFreeSockets: 1,
  timeout: 30000,
});

/**
 * ZhiPu Web Search API - standalone search tool
 * POST https://open.bigmodel.cn/api/paas/v4/web_search
 */
export function webSearch(query: string, count: number = 5, signal?: AbortSignal): Promise<SearchResult[]> {
  return new Promise((resolve, reject) => {
    // Read key at call time (after dotenv has loaded)
    const apiKey = process.env.ZHIPU_API_KEY || '';
    if (!apiKey) {
      reject(new Error('ZHIPU_API_KEY 未配置，请检查 .env 文件'));
      return;
    }

    const data = JSON.stringify({
      search_engine: 'search-std',
      search_query: query,
      count,
    });

    if (signal?.aborted) {
      reject(new Error('Search cancelled'));
      return;
    }

    const req = https.request({
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/web_search',
      method: 'POST',
      agent: searchAgent,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try {
          const parsed: WebSearchResponse = JSON.parse(body);
          if (parsed.search_result) {
            resolve(parsed.search_result);
          } else {
            // API returned but no results field - might be an error
            const errMsg = (parsed as any).error?.message;
            if (errMsg) {
              reject(new Error(errMsg));
            } else {
              resolve([]);
            }
          }
        } catch {
          reject(new Error('搜索响应解析失败'));
        }
      });
    });

    const onAbort = () => req.destroy(new Error('Search cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('搜索请求超时 (30s)'));
    });
    req.on('close', () => signal?.removeEventListener('abort', onAbort));
    req.write(data);
    req.end();
  });
}

export function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return '未找到相关结果。';
  return results.map((r, i) => {
    const date = r.publish_date ? ` (${r.publish_date})` : '';
    const source = r.media ? ` - ${r.media}` : '';
    return `[${i + 1}] ${r.title}${source}${date}\n    ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}\n    🔗 ${r.link}`;
  }).join('\n\n');
}

export function formatSearchForAI(results: SearchResult[]): string {
  if (!results.length) return '未找到相关搜索结果。';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.content}\n来源: ${r.link}`
  ).join('\n\n');
}
