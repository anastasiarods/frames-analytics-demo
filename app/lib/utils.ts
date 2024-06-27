import { Frame } from "frames.js";
import { nanoid } from "nanoid";
import { LINKS } from "./constants";

export function getFrameMetadata(frame: Frame) {
  const buttons =
    frame.buttons?.reduce((acc, button, idx) => {
      acc.push({
        property: `fc:frame:button:${idx + 1}`,
        content: button.label,
      });

      acc.push({
        property: `fc:frame:button:${idx + 1}:action`,
        content: button.action,
      });

      if (button.target) {
        acc.push({
          property: `fc:frame:button:${idx + 1}:target`,
          content: button.target,
        });
      }

      return acc;
    }, [] as { property: string; content: string }[]) || [];

  return [
    {
      property: "fc:frame",
      content: frame.version,
    },
    {
      property: "fc:frame:image",
      content: frame.image,
    },
    {
      property: "fc:frame:post_url",
      content: frame.postUrl,
    },
    {
      property: "og:image",
      content: frame.ogImage || frame.image,
    },
    ...buttons,
    ...(frame.imageAspectRatio
      ? [
          {
            property: "fc:frame:image:aspect_ratio",
            content: frame.imageAspectRatio,
          },
        ]
      : []),
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saveUrl(url: string, kv: any) {
  const urlObj = new URL(url);
  const host = urlObj.host;
  const stored = await kv.get(host);

  if (stored) {
    return kv.get(host);
  }

  const id = nanoid(6);
  kv.put(id, host);
  kv.put(host, id);
  return id;
}

export async function wrapUrl(
  analyticsDomain: string,
  originalUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kv: any
) {
  //   // Parse the original URL
  const parsedUrl: URL = new URL(originalUrl);
  const wrappedUrl: URL = new URL(analyticsDomain + "/api/a/");

  const id = await saveUrl(originalUrl, kv);

  // Add the original URL as a parameter
  wrappedUrl.searchParams.set("r", id);
  wrappedUrl.searchParams.set("u", parsedUrl.pathname);

  return wrappedUrl.toString();
}
