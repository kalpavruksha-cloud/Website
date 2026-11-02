import { Readable } from 'node:stream';

export async function handleWebRequest(request, response, handler) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  const options = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) { options.body = Readable.toWeb(request); options.duplex = 'half'; }
  const webRequest = new Request(`http://${request.headers.host || 'localhost'}${request.url}`, options);
  const result = await handler(webRequest);
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(request.method === 'HEAD' ? undefined : Buffer.from(await result.arrayBuffer()));
}
