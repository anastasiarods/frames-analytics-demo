/* eslint-disable @typescript-eslint/no-explicit-any */
import { type ActionFunctionArgs } from "@remix-run/cloudflare";
import {
  FrameActionPayload,
  getFrame,
  getFrameHtml,
  validateFrameMessage,
} from "frames.js";
import { wrapLinksInFrame } from "~/lib/utils";
import { captureEvent, identifyUser } from "./posthog";
import { fetchHubContext } from "~/lib/frameUtils.server";

const session: Record<string, any> = {};

function getPrevButtons(fid: string, postId: string) {
  if (session[`${postId}:${fid}`]) {
    return session[`${postId}:${fid}`];
  }
  return session[postId];
}

async function trackFrameAction({
  body,
  postUrl,
  postId,
  apiKey,
  region,
}: {
  body: FrameActionPayload;
  postUrl: string;
  postId: string;
  apiKey: string;
  region: string;
}) {
  const { fid, castId, buttonIndex, inputText } = body.untrustedData;
  const prevButtons = getPrevButtons(fid.toString(), postId);
  const castUrl = `https://warpcast.com/~/conversations/${castId.hash}`;
  const button = prevButtons ? prevButtons[buttonIndex - 1] : null;

  await captureEvent({
    region,
    apiKey,
    distinctId: fid.toString(),
    eventName: "frame_click",
    properties: {
      castHash: castId.hash,
      buttonIndex: buttonIndex.toString(),
      castUrl: castUrl,
      buttonLabel: button?.label,
      postUrl: postUrl,
      inputText: inputText,
    },
  });
}

async function trackExternalLinkClick({
  body,
  link,
  postUrl,
  postId,
  apiKey,
  region,
}: {
  body: FrameActionPayload;
  link: string;
  postUrl: string;
  postId: string;
  apiKey: string;
  region: string;
}) {
  const { fid, castId, buttonIndex, inputText } = body.untrustedData;
  const prevButtons = getPrevButtons(fid.toString(), postId);
  const castUrl = `https://warpcast.com/~/conversations/${castId.hash}`;
  const button = prevButtons ? prevButtons[buttonIndex - 1] : null;

  await captureEvent({
    region,
    apiKey,
    distinctId: fid.toString(),
    eventName: "frame_click_link",
    properties: {
      castHash: castId.hash,
      castUrl: castUrl,
      buttonIndex: buttonIndex.toString(),
      buttonLabel: button?.label,
      postUrl: postUrl,
      link: link,
      inputText: inputText,
    },
  });
}

async function identify({
  body,
  apiKey,
  region,
}: {
  body: FrameActionPayload;
  apiKey: string;
  region: string;
}) {
  const { isValid, message } = await validateFrameMessage(body);

  if (!isValid) {
    console.error("Invalid frame action message", message);
    return;
  }

  const fid = body.untrustedData.fid;
  const cast = message?.data.frameActionBody.castId;

  if (message?.data.fid && cast && !session[fid]) {
    let hubContext = session[`${fid}:data`];

    if (!hubContext) {
      hubContext = await fetchHubContext(fid, cast);
      session[`${fid}:data`] = hubContext;
    }

    await identifyUser({
      region,
      apiKey,
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
    //Get request only for the first frame
    if (request.method === "GET") {
      const url = new URL(request.url);
      const id = url.searchParams.get("r");
      const redirect = await MY_KV.get(id);
      const html = await fetch(redirect).then((res) => res.text());
      const ogFrame = getFrame({ htmlString: html, url: redirect });

      if (!ogFrame || ogFrame.status !== "success" || id === null) {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame({
        ogFrame: ogFrame.frame,
        host: HOST_URL,
        ogId: id,
        kv: MY_KV,
      });

      const frameHtml = getFrameHtml(frame);
      if (frame.postUrl && frame.buttons) {
        session[id] = frame.buttons;
        const firstFrame = new URL(frame?.postUrl).search;
        //save the link of the first frame
        await MY_KV.put(`${id}:first`, firstFrame);
      }

      const scriptString = `<Script
        id="my-script"
        strategy="beforeInteractive"
      >{typeof window !== "undefined" && window.location.replace("${redirect}")}</Script>`;

      //add script to redirect to the original page after <html> tag
      const frameHtmlWithScript = frameHtml.replace(
        "<html>",
        `<html>${scriptString}`
      );

      return new Response(frameHtmlWithScript, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    if (request.method === "POST") {
      const body: FrameActionPayload = await request.json();

      const url = new URL(request.url);
      const nextId = url.searchParams.get("n");
      const ogId = url.searchParams.get("r");
      const redirect = await MY_KV.get(nextId);
      const fid = body.untrustedData.fid;
      const region = await MY_KV.get(`${ogId}:region`);

      //if it is request to the first frame, delete the prev session
      const firstFrameUrl = await MY_KV.get(`${ogId}:first`);
      if (firstFrameUrl === url.search) {
        //delete prev session
        delete session[`${ogId}:${fid}`];
      }

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
      const ogFrame = getFrame({ htmlString: html, url: redirect });
      const apiKey = await MY_KV.get(`${ogId}:apiKey`);

      try {
        if (!session[`${fid}:data`]) await identify({ body, apiKey, region });
      } catch (error) {
        console.error("Error identifying user", error);
      }

      if (response.redirected) {
        await trackExternalLinkClick({
          body,
          link: response.url,
          postUrl: redirect,
          postId: ogId || "",
          apiKey: apiKey,
          region,
        });
        return new Response("Redirected", {
          status: 302,
          headers: {
            Location: response.url,
          },
        });
      }

      if (!ogFrame || ogFrame.status !== "success" || ogId === null) {
        return new Response(html, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      }

      const frame = await wrapLinksInFrame({
        ogFrame: ogFrame.frame,
        host: HOST_URL,
        ogId,
        kv: MY_KV,
      });

      const frameHtml = getFrameHtml(frame);
      await trackFrameAction({
        body,
        postUrl: redirect,
        postId: ogId || "",
        apiKey: apiKey,
        region,
      });
      if (frame.buttons) session[`${ogId}:${fid}`] = frame.buttons;

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
