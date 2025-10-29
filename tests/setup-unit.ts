import { TextDecoder, TextEncoder } from 'util';

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;
}

if (typeof globalThis.fetch === 'undefined') {
  // node-fetch types have changed between versions, use dynamic import
  const nodeFetch: any = await import('node-fetch');
  globalThis.fetch = (nodeFetch.default || nodeFetch) as unknown as typeof globalThis.fetch;
  globalThis.Headers = nodeFetch.Headers as unknown as typeof globalThis.Headers;
  globalThis.Request = nodeFetch.Request as unknown as typeof globalThis.Request;
  globalThis.Response = nodeFetch.Response as unknown as typeof globalThis.Response;
}
