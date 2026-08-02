export type FetchResult = {
  url: string;
  contentType: string | null;
  buffer?: Buffer;
  text?: string;
};

export async function fetchUrlContent(url: string, timeoutMs = 15000): Promise<FetchResult> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const contentType = res.headers.get("content-type");
    const ct = contentType ? contentType.split(";")[0] : null;

    // prefer buffer (binary) for PDFs
    if (ct && ct.includes("pdf")) {
      const array = await res.arrayBuffer();
      return { url, contentType: ct, buffer: Buffer.from(array) };
    }

    const text = await res.text();
    return { url, contentType: ct, text };
  } finally {
    clearTimeout(id);
  }
}

export function isPdfBuffer(buffer?: Buffer): boolean {
  if (!buffer) return false;
  // check PDF header %PDF-
  return buffer.slice(0, 4).toString() === "%PDF";
}
