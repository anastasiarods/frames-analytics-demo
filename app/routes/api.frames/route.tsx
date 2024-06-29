import { type ActionFunctionArgs } from "@remix-run/cloudflare";
import { wrapUrl } from "~/lib/utils";

interface CreateFramePayload {
  url: string;
}

const handleRequest = async ({ request, context }: ActionFunctionArgs) => {
  try {
    if (request.method === "POST") {
      const body = await request.json();

      const { url } = body as CreateFramePayload;

      // const html = await fetch(url).then((res) => res.text());
      // console.log(html);
      // const frame = getFrame({ htmlString: html, url });

      //@ts-expect-error - this is a cloudflare worker
      const { HOST_URL } = context.cloudflare.env;
      //@ts-expect-error - this is a cloudflare worker
      const { MY_KV } = context.cloudflare.env;
      const newUrl = await wrapUrl(HOST_URL, url, MY_KV);

      return new Response(newUrl, { status: 200 });
    }
  } catch (error) {
    console.error(error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const action = handleRequest;
export const loader = handleRequest;
