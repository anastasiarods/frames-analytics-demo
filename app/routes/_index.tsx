import { MetaFunction, json } from "@remix-run/cloudflare";
import { Frame } from "frames.js";
import { HOST_URL } from "~/lib/constants";
import { getFrameMetadata } from "~/lib/utils";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";

export const loader = async ({ context }: LoaderFunctionArgs) => {
  //@ts-expect-error - This is a Cloudflare Worker KV namespace
  const { MY_KV } = context.cloudflare.env;
  const key = "test";
  await MY_KV.put(key, "Hello, world!");
  const value = await MY_KV.get(key);
  return json({ value });
};

const initialFrame: Frame = {
  image: "https://picsum.photos/seed/frames.js/1146/600",
  version: "vNext",
  buttons: [
    {
      label: "Check it out",
      action: "post",
    },
  ],
  postUrl: `${HOST_URL}/api/analytics`,
};

export const meta: MetaFunction = () => {
  return [
    { title: "Very cool app | Remix" },
    {
      property: "og:title",
      content: "Very cool app",
    },
    {
      name: "description",
      content: "This app is the best",
    },
    ...getFrameMetadata(initialFrame),
  ];
};

export default function Index() {
  const { value } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Welcome to Remix</h1>
      {value && <p>{`This is value from kv: ${value}`}</p>}
    </div>
  );
}
