const endpoint = "https://eu.i.posthog.com";
const apiKey = "";

export async function captureEvent({
  distinctId,
  eventName,
  properties,
}: {
  distinctId: string;
  eventName: string;
  properties: Record<string, string>;
}) {
  const url = `${endpoint}/capture/`;
  const body = {
    api_key: apiKey,
    event: eventName,
    distinct_id: distinctId,
    properties: properties,
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function identifyUser({
  distinctId,
  userProperties,
}: {
  distinctId: string;
  userProperties: Record<string, string>;
}) {
  const url = `${endpoint}/capture/`;
  const body = {
    api_key: apiKey,
    event: "$identify",
    distinct_id: distinctId,
    properties: {
      $set: userProperties,
    },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

export async function margeIds({
  distinctId,
  newDistinctId,
}: {
  distinctId: string;
  newDistinctId: string;
}) {
  const url = `${endpoint}/capture/`;
  const body = {
    api_key: apiKey,
    event: "$create_alias",
    distinct_id: distinctId,
    properties: {
      alias: newDistinctId,
    },
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return response.json();
}
