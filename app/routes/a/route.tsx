import { type ActionFunctionArgs } from "@remix-run/cloudflare";
import {
  FrameActionPayload,
  getFrame,
  getFrameHtml,
  validateFrameMessage,
} from "frames.js";
import { wrapLinksInFrame, wrapUrl } from "~/lib/utils";
import { captureEvent, identifyUser } from "./posthog";
import { fetchHubContext } from "~/lib/frameUtils.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session: Record<string, any> = {};

async function extractOgUrl(url: URL, kv: any) {
  const redirectHostId = url.searchParams.get("r");
  const redirectHost = await kv.get(redirectHostId);
  const redirectPath = url.searchParams.get("u");
  return new URL(`https://${redirectHost}${redirectPath}`);
}

async function trackFrameAction(body: FrameActionPayload, postUrl: string) {
  const fid = body.untrustedData.fid;
  const cast = body.untrustedData.castId;
  const buttonIndex = body.untrustedData.buttonIndex;
  let prevButtons = session[fid.toString()];
  const castUrl = `https://warpcast.com/~/conversations/${cast.hash}`;

  if (!prevButtons && postUrl) {
    prevButtons = session[postUrl];
  }

  let button;
  if (prevButtons) {
    button = prevButtons[buttonIndex - 1];
  }

  const r = await captureEvent({
    distinctId: fid.toString(),
    eventName: "frame_click",
    properties: {
      castHash: cast.hash,
      buttonIndex: buttonIndex.toString(),
      castUrl: castUrl,
      buttonLabel: button?.label,
      postUrl: postUrl,
    },
  });

  console.log(r);
}

async function trackExternalLinkClick(
  body: FrameActionPayload,
  link: string,
  postUrl: string
) {
  const fid = body.untrustedData.fid;
  const cast = body.untrustedData.castId;
  const buttonIndex = body.untrustedData.buttonIndex;
  const prevButtons = session[fid.toString()];
  const castUrl = `https://warpcast.com/~/conversations/${cast.hash}`;

  let button;
  if (prevButtons) {
    button = prevButtons[buttonIndex - 1];
  }

  console.log(postUrl);

  const r = await captureEvent({
    distinctId: fid.toString(),
    eventName: "frame_click_link",
    properties: {
      castHash: cast.hash,
      castUrl: castUrl,
      buttonIndex: buttonIndex.toString(),
      buttonLabel: button?.label,
      postUrl: postUrl,
      link: link,
    },
  });

  console.log(r);
}

async function identify(body: FrameActionPayload) {
  console.log("Identifying user", body);
  const { isValid, message } = await validateFrameMessage(body);

  if (!isValid) {
    console.error("Invalid frame action message", message);
    return;
  }

  const fid = body.untrustedData.fid;
  const cast = message?.data.frameActionBody.castId;

  if (message?.data.fid && cast && !session[fid]) {
    let hubContext = session[`${fid}-data`];

    if (!hubContext) {
      hubContext = await fetchHubContext(fid, cast);
      session[`${fid}-data`] = hubContext;
    }

    await identifyUser({
      distinctId: fid.toString(),
      userProperties: {
        verifiedAddresses: JSON.stringify(
          hubContext.requesterVerifiedAddresses
        ),
        warpcastUrl: `https://warpcast.com/${hubContext.requesterUserData.username}`,
        custodyAddress: hubContext.requesterCustodyAddress
          ? hubContext.requesterCustodyAddress?.toString()
          : "",
        verifiedAddress:
          hubContext.requesterVerifiedAddresses.length === 1
            ? hubContext.requesterVerifiedAddresses[0]
            : "",
        ...hubContext.requesterUserData,
      },
    });
  }
}

const handleRequest = async ({ request, context }: ActionFunctionArgs) => {
  //@ts-expect-error - this is a cloudflare worker
  const { HOST_URL } = context.cloudflare.env;
  //@ts-expect-error - this is a cloudflare worker
  const { MY_KV } = context.cloudflare.env;

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const redirect = await extractOgUrl(url, MY_KV);
      const html = await fetch(redirect).then((res) => res.text());
      const ogFrame = getFrame({ htmlString: html, url: redirect.toString() });
      const postId = url.searchParams.get("r");

      if (!ogFrame || !ogFrame.frame || ogFrame.status !== "success") {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame(ogFrame.frame, HOST_URL, MY_KV);
      const frameHtml = getFrameHtml(frame);

      if (frame.postUrl && frame.buttons && postId)
        session[redirect.href] = frame.buttons;

      //refirect
      return new Response(frameHtml, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    if (request.method === "POST") {
      const body: FrameActionPayload = await request.json();
      const url = new URL(request.url);
      const redirect = await extractOgUrl(url, MY_KV);
      const fid = body.untrustedData.fid;

      const response = await fetch(redirect, {
        method: "POST",
        headers: {
          "Content-Type":
            request.headers.get("Content-Type") || "application/json",
          ...request.headers,
        },
        body: JSON.stringify(body),
      });

      const html = await response.text();
      const ogFrame = getFrame({ htmlString: html, url: redirect.toString() });

      try {
        if (!session[`${fid}-data`]) await identify(body);
      } catch (error) {
        console.error("Error identifying user", error);
      }

      if (response.redirected) {
        await trackExternalLinkClick(body, response.url, redirect.href);
        return new Response("Redirected", {
          status: 302,
          headers: {
            Location: response.url,
          },
        });
      }

      if (!ogFrame || !ogFrame.frame || ogFrame.status !== "success") {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame(ogFrame.frame, HOST_URL, MY_KV);
      const frameHtml = getFrameHtml(frame);

      await trackFrameAction(body, redirect.href);

      if (frame.postUrl && frame.buttons) session[fid] = frame.buttons;

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
