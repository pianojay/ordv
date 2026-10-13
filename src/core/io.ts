import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
export const remote = (s: string) => /^https?:\/\//i.test(s);
export function within(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export async function safeFile(root: string, file: string) {
  const resolved = await fs.realpath(file);
  if (!within(root, resolved)) throw new Error('File escapes the selected root');
  return resolved;
}
export function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224 || a === 198 && (b === 18 || b === 19));
  }
  const a = address.toLowerCase();
  if (a.startsWith('::ffff:')) {
    const tail = a.slice(7);
    if (isIP(tail) === 4) return publicAddress(tail);
    const parts = tail.split(':');
    if (parts.length === 2) { const n = parseInt(parts[0], 16), m = parseInt(parts[1], 16); return publicAddress(`${n >> 8}.${n & 255}.${m >> 8}.${m & 255}`); }
    return false;
  }
  return isIP(a) === 6 && a.startsWith('2') && !a.startsWith('2001:db8:') && !a.startsWith('2002:');
}
export async function checkURL(value: string) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error('Only public HTTP(S) URLs without credentials are supported');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('Private or local network URLs are not supported');
  return u;
}
export interface FetchResult { data: Buffer; type: string; url: string }
export type Fetcher = (url: string, maxBytes: number, refresh: boolean) => Promise<FetchResult>;
async function publicRequest(url: URL, maxBytes: number, signal: AbortSignal): Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; data: Buffer }> {
  return new Promise((resolve, reject) => {
    // Validate the actual socket lookup as well as every redirect URL. This keeps
    // a second DNS answer from redirecting the connection into a private network.
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      signal, headers: { 'user-agent': 'MarkdownReadingPacket/0.1' },
      lookup: ((host: string, options: any, callback: any) => {
        lookup(host, { all: true }).then(addresses => {
          if (!addresses.length || addresses.some(a => !publicAddress(a.address))) return callback(new Error('Private or local network URLs are not supported'));
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        }, callback);
      }) as any
    }, response => {
      const status = response.statusCode || 0;
      if (status >= 300 && status < 400) { response.destroy(); resolve({ status, headers: response.headers, data: Buffer.alloc(0) }); return; }
      if (status >= 400) { response.destroy(); reject(new Error(`HTTP ${status}`)); return; }
      if (Number(response.headers['content-length']) > maxBytes) { response.destroy(); reject(new Error('Resource exceeds the size limit')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { response.destroy(); reject(new Error('Resource exceeds the size limit')); } else chunks.push(chunk); });
      response.on('end', () => resolve({ status, headers: response.headers, data: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('error', reject); request.end();
  });
}
export function cachedFetcher(cacheDir: string): Fetcher {
  return async (url, maxBytes, refresh) => {
    const cacheFile = path.join(cacheDir, `${hash(url)}.json`);
    if (!refresh) {
      try {
        const cached = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
        const data = Buffer.from(cached.data, 'base64');
        if (data.length > maxBytes) throw new Error('Cached resource exceeds the size limit');
        return { data, type: cached.type, url: cached.url };
      } catch (e: any) { if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e; }
    }
    let next = url;
    const signal = AbortSignal.timeout(15000);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const checked = await checkURL(next);
      const response = await publicRequest(checked, maxBytes, signal);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.location;
        if (!location) throw new Error('Redirect has no destination');
        next = new URL(location, checked).href; continue;
      }
      if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
      const result = { data: response.data, type: (response.headers['content-type'] || '').split(';')[0], url: checked.href };
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cacheFile, JSON.stringify({ ...result, data: result.data.toString('base64') }));
      return result;
    }
    throw new Error('Too many redirects');
  };
}
export function resolveReference(source: string, href: string): { source?: string; fragment?: string } {
  if (href.startsWith('#')) return { source, fragment: decodeURIComponent(href.slice(1)) };
  if (remote(source) || remote(href)) {
    const u = new URL(href, remote(source) ? source : undefined);
    const fragment = decodeURIComponent(u.hash.slice(1)); u.hash = '';
    return { source: u.href, fragment };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^[a-z]:[\\/]/i.test(href)) return {};
  const at = href.indexOf('#'), before = at < 0 ? href : href.slice(0, at);
  return { source: path.resolve(path.dirname(source), decodeURIComponent(before.split('?')[0]).replace(/[\\/]/g, path.sep)), fragment: at < 0 ? '' : decodeURIComponent(href.slice(at + 1)) };
}
