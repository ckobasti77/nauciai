/**
 * Tanak fetch-klijent za fal.ai queue API. Namerno bez fal SDK-a - manje
 * zavisnosti i lakše za test (.studio-run/prompts/A8.md).
 */

export type FalSubmitResult = { requestId: string };

/**
 * `https://queue.fal.run/{endpoint}?fal_webhook={encoded webhookUrl}`.
 * `webhookUrl` se enkoduje da upitni znakovi iz njega (npr. iz nekog budućeg
 * query parametra) ne otvore drugi `?` u konačnom URL-u.
 */
export function buildQueueUrl(endpoint: string, webhookUrl: string): string {
  return `https://queue.fal.run/${endpoint}?fal_webhook=${encodeURIComponent(webhookUrl)}`;
}

export async function submitToFal(params: {
  endpoint: string;
  input: Record<string, unknown>;
  webhookUrl: string;
  apiKey: string;
}): Promise<FalSubmitResult> {
  const response = await fetch(buildQueueUrl(params.endpoint, params.webhookUrl), {
    method: "POST",
    headers: {
      // Doslovno "Key", ne "Bearer" - tako fal queue API zahteva.
      Authorization: `Key ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params.input),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`fal request failed (${response.status}): ${body}`);
  }

  // `gateway_request_id` se menja pri retry-ju - `request_id` je stabilan.
  const data = (await response.json()) as { request_id: string; gateway_request_id?: string };
  return { requestId: data.request_id };
}
