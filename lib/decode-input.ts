import brotliPromise, { type BrotliWasmType } from "brotli-wasm";

let brotli: BrotliWasmType | null = null;

async function getBrotli(): Promise<BrotliWasmType> {
  if (!brotli) brotli = await brotliPromise;
  return brotli;
}

const BASE64_RE = /^[A-Za-z0-9+/\-_=\s]+$/;
const GQL_TOKEN_RE = /^\s*(query|mutation|subscription|fragment|\{)/;
const JSON_TOKEN_RE = /^\s*[\[{]/;

function normaliseBase64(raw: string): string {
  let b64 = raw.trim().replace(/\s+/g, "");
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  return b64;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Attempt to decode a string that may be base64-encoded (URL-safe or standard,
 * with or without padding) and optionally brotli-compressed.
 *
 * Returns the decoded text if it looks like a GraphQL document, or null.
 */
export async function decodeQueryInput(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (trimmed.length < 20 || !BASE64_RE.test(trimmed)) return null;

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(normaliseBase64(trimmed));
  } catch {
    return null;
  }

  // Try brotli decompression first
  try {
    const br = await getBrotli();
    const decompressed = br.decompress(bytes);
    const text = bytesToString(decompressed);
    if (GQL_TOKEN_RE.test(text)) return text;
  } catch {
    // Not brotli-compressed, fall through
  }

  // Plain base64 (no compression)
  try {
    const text = bytesToString(bytes);
    if (GQL_TOKEN_RE.test(text)) return text;
  } catch {
    // Not valid UTF-8
  }

  return null;
}

/**
 * Same as decodeQueryInput but accepts JSON variables.
 */
export async function decodeVariablesInput(
  raw: string
): Promise<string | null> {
  const trimmed = raw.trim();
  if (trimmed.length < 4 || !BASE64_RE.test(trimmed)) return null;

  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(normaliseBase64(trimmed));
  } catch {
    return null;
  }

  // Try brotli decompression first
  try {
    const br = await getBrotli();
    const decompressed = br.decompress(bytes);
    const text = bytesToString(decompressed);
    if (JSON_TOKEN_RE.test(text)) {
      JSON.parse(text);
      return text;
    }
  } catch {
    // Not brotli-compressed or not valid JSON
  }

  // Plain base64 (no compression)
  try {
    const text = bytesToString(bytes);
    if (JSON_TOKEN_RE.test(text)) {
      JSON.parse(text);
      return text;
    }
  } catch {
    // Not valid UTF-8 / JSON
  }

  return null;
}
