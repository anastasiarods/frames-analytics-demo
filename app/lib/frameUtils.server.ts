import { DEFAULT_HUB_API_KEY, DEFAULT_HUB_API_URL } from "./constants";
import { getAddressesForFid, getUserDataForFid } from "frames.js";
import { createPublicClient, http, parseAbi } from "viem";
import { optimism } from "viem/chains";

async function ffff(fid: number) {
  const publicClient = createPublicClient({
    transport: http(),
    chain: optimism,
  });
  const address = await publicClient.readContract({
    abi: parseAbi(["function custodyOf(uint256 fid) view returns (address)"]),
    // IdRegistry contract address
    address: "0x00000000fc6c5f01fc30151999387bb99a9f489b",
    functionName: "custodyOf",
    args: [BigInt(fid)],
  });
  return { address, type: "custody" };
}

const hubHttpUrl = DEFAULT_HUB_API_URL;
const hubRequestOptions = {
  headers: {
    api_key: DEFAULT_HUB_API_KEY,
  },
};

export function bytesToHexString(bytes: Uint8Array): `0x${string}` {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

export function normalizeCastId(castId: { fid: string; hash: Uint8Array }): {
  fid: string;
  hash: `0x${string}`;
} {
  return {
    fid: castId.fid,
    hash: bytesToHexString(castId.hash),
  };
}

export async function fetchHubContext(
  requesterFid: number,
  castId: {
    fid: number;
    hash: Uint8Array;
  }
) {

  // console.log("fetchHubContext", await ffff(requesterFid));

  const [
    requesterFollowsCaster,
    casterFollowsRequester,
    likedCast,
    recastedCast,
    requesterEthAddresses,
    requesterUserData,
  ] = await Promise.all([
    fetch(
      `${hubHttpUrl}/v1/linkById?fid=${requesterFid}&target_fid=${castId?.fid}&link_type=follow`,
      hubRequestOptions
    ).then((res) => res.ok || requesterFid === castId?.fid),
    fetch(
      `${hubHttpUrl}/v1/linkById?fid=${castId?.fid}&target_fid=${requesterFid}&link_type=follow`,
      hubRequestOptions
    ).then((res) => res.ok || requesterFid === castId?.fid),
    fetch(
      `${hubHttpUrl}/v1/reactionById?fid=${requesterFid}&reaction_type=1&target_fid=${castId?.fid}&target_hash=${castId?.hash}`,
      hubRequestOptions
    ).then((res) => res.ok),
    fetch(
      `${hubHttpUrl}/v1/reactionById?fid=${requesterFid}&reaction_type=2&target_fid=${castId?.fid}&target_hash=${castId?.hash}`,
      hubRequestOptions
    ).then((res) => res.ok),
    getAddressesForFid({
      fid: requesterFid,
      options: {
        hubHttpUrl,
        hubRequestOptions,
      },
    }),
    getUserDataForFid({
      fid: requesterFid,
      options: {
        hubHttpUrl,
        hubRequestOptions,
      },
    }),
  ]);

  const requesterCustodyAddress = requesterEthAddresses.find(
    (item) => item.type === "custody"
  )?.address;

  //   if (!requesterCustodyAddress) {
  //     throw new Error("Custody address not found");
  //   }

  const requesterVerifiedAddresses = requesterEthAddresses
    .filter((item) => item.type === "verified")
    .map((item) => item.address);

  // Perform actions to fetch the HubFrameContext and then return the combined result
  const hubContext = {
    casterFollowsRequester,
    requesterFollowsCaster,
    likedCast,
    recastedCast,
    requesterVerifiedAddresses,
    requesterCustodyAddress,
    requesterUserData,
  };

  return hubContext;
}
