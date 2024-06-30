import { Frame } from "frames.js";
import { saveUrl } from "./db";

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
export function wrapUrl(
  analyticsDomain: string,
  ogId: string,
  nextId?: string
) {
  if (nextId) {
    return `${analyticsDomain}/a/?r=${ogId}&n=${nextId}`;
  }

  return `${analyticsDomain}/a/?r=${ogId}`;
}

export async function wrapLinksInFrame({
  ogFrame,
  host,
  ogId,
  kv,
}: {
  ogFrame: Frame;
  host: string;
  ogId: string;
  kv: unknown;
}) {
  const frame = { ...ogFrame };

  if (frame.postUrl) {
    const id = await saveUrl(frame.postUrl, kv);
    frame.postUrl = wrapUrl(host, ogId, id);
  }

  // if (frame.buttons) {
  //   for (let i = 0; i < frame.buttons.length; i++) {
  //     const url = frame.buttons[i].target;
  //     if (url && frame.buttons[i].action === "tx") {
  //       const id = await saveUrl(url, kv);
  //       frame.buttons[i].target = wrapUrl(host, ogId, id);
  //     }
  //   }
  // }

  return frame;
}
