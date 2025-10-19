import { TextDecoder, TextEncoder } from 'util';

if (typeof globalThis.TextEncoder === 'undefined') {
  // @ts-expect-error - assigning to global
  globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  // @ts-expect-error - assigning to global
  globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
}

if (typeof globalThis.fetch === 'undefined') {
  const { fetch, Headers, Request, Response } = await import('node-fetch');
  // @ts-expect-error - assigning to global
  globalThis.fetch = fetch;
  // @ts-expect-error - assigning to global
  globalThis.Headers = Headers;
  // @ts-expect-error - assigning to global
  globalThis.Request = Request;
  // @ts-expect-error - assigning to global
  globalThis.Response = Response;
}
