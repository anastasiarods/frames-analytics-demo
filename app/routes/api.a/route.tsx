import { json, type ActionFunctionArgs } from "@remix-run/cloudflare";
import {
  Frame,
  FrameActionPayload,
  getFrame,
  getFrameHtml,
  validateFrameMessage,
} from "frames.js";
import { wrapUrl } from "~/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function wrapLinksInFrame(ogFrame: Frame, host: string, kv: any) {
  const frame = { ...ogFrame };

  if (frame.postUrl) {
    frame.postUrl = await wrapUrl(host, frame.postUrl, kv);
  }

  if (frame.buttons) {
    for (let i = 0; i < frame.buttons.length; i++) {
      const url = frame.buttons[i].target;
      if (url) {
        frame.buttons[i].target = await wrapUrl(host, url, kv);
      }
    }
  }

  return frame;
}

const handleRequest = async ({ request, context }: ActionFunctionArgs) => {
  // @ts-expect-error - This is a Cloudflare Worker KV namespace
  const { HOST_URL } = context.cloudflare.env;
  //@ts-expect-error - This is a Cloudflare Worker KV namespace
  const { MY_KV } = context.cloudflare.env;
  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const redirectHostId = url.searchParams.get("r");
      const redirectHost = await MY_KV.get(redirectHostId);
      const redirectPath = url.searchParams.get("u");

      if (!redirectHost || !redirectPath) {
        return new Response("Invalid URL", { status: 400 });
      }

      const redirect = new URL(`https://${redirectHost}${redirectPath}`);
      const html = await fetch(redirect).then((res) => res.text());
      const ogFrame = getFrame({ htmlString: html, url: redirect.toString() });

      if (!ogFrame || !ogFrame.frame || ogFrame.status !== "success") {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame(ogFrame.frame, HOST_URL, MY_KV);
      const frameHtml = getFrameHtml(frame);

      //refirect
      return new Response(frameHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    if (request.method === "POST") {
      // const body: FrameActionPayload = await request.json();
      const url = new URL(request.url);
      const redirectHostId = url.searchParams.get("r");
      const redirectHost = await MY_KV.get(redirectHostId);
      const redirectPath = url.searchParams.get("u");

      if (!redirectHost || !redirectPath) {
        return new Response("Invalid URL", { status: 400 });
      }

      const redirect = new URL(`https://${redirectHost}${redirectPath}`);

      // const { isValid, message } = await validateFrameMessage(body);

      // const fid = body.untrustedData.fid;
      // const cast = body.untrustedData.castId
      // const castId = cast.fid
      // const castHash = cast.hash

      // const rewsp = await captureEvent({
      //     distinctId: fid.toString(),
      //     eventName: "frame_action",
      //     properties: {
      //       castHash: castHash,
      //       buttonIndex: body.untrustedData.buttonIndex.toString(),
      //     },
      // })

      // console.log(rewsp)

      // if (message?.data.fid && message?.data.frameActionBody.castId) {
      //   const hubContext = await fetchHubContext(
      //     message?.data.fid,
      //     message?.data.frameActionBody.castId
      //   );
      //   console.log(JSON.stringify(hubContext, null, 2));
      // }

      //send new post request to /api/frames

      // const postRequest = new Request(redirect, request);
      // console.log(postRequest);

      const response = await fetch(redirect, {
        method: "POST",
        headers: {
          "Content-Type":
            request.headers.get("Content-Type") || "application/json",
          ...request.headers,
        },
        body: request.body,
      });

      const html = await response.text();
      const ogFrame = getFrame({ htmlString: html, url: redirect.toString() });

      if (!ogFrame || !ogFrame.frame || ogFrame.status !== "success") {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame(ogFrame.frame, HOST_URL, MY_KV);
      const frameHtml = getFrameHtml(frame);

      return new Response(frameHtml, {
        headers: {
          "Content-Type":
            response.headers.get("Content-Type") || "application/json",
        },
      });
    }
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const action = handleRequest;
export const loader = handleRequest;
