import { nanoid } from "nanoid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveOgUrl(url: string, apiKey: string, kv: any, region: string) {
  const id = nanoid(8);
  await kv.put(id, url);
  await kv.put(id + ":apiKey", apiKey);

  if (region === "us") {
    await kv.put(id + ":region", "us");
  } else {
    await  kv.put(id + ":region", "eu");
  }

  return id;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveUrl(url: string, kv: any) {
  const id = nanoid(8);
  await  kv.put(id, url);
  return id;
}

export async function saveSession() {}
