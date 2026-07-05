import { convexMutations, getConvexHttpClient } from "@/lib/convex-http";
import { requireWebhookSyncSecret } from "@/lib/env";
import { getMux } from "@/lib/mux";

type MuxWebhookData = {
  asset_id?: string;
  id?: string;
  upload_id?: string;
  duration?: number;
  playback_ids?: Array<{
    id?: string;
    policy?: string;
  }>;
};

function statusForMuxEvent(type: string) {
  if (type === "video.asset.ready") return "ready";
  if (type === "video.asset.errored") return "errored";
  return "preparing";
}

export async function POST(request: Request) {
  const mux = getMux();
  const body = await request.text();

  let event;
  try {
    event = await mux.webhooks.unwrap(body, request.headers);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Mux webhook";
    return Response.json({ error: message }, { status: 400 });
  }

  const data = event.data as MuxWebhookData;
  const muxAssetId = data.asset_id ?? data.id;
  const muxUploadId = event.type.startsWith("video.upload") ? data.id : data.upload_id;
  const muxPlaybackId = data.playback_ids?.find((playback) => playback.policy === "signed")?.id;
  const durationSeconds = typeof data.duration === "number" ? Math.round(data.duration) : undefined;

  if (muxAssetId && process.env.WEBHOOK_SYNC_SECRET) {
    const convex = getConvexHttpClient();
    await convex?.mutation(convexMutations.syncMuxAsset, {
      syncSecret: requireWebhookSyncSecret(),
      muxUploadId,
      muxAssetId,
      muxPlaybackId,
      durationSeconds,
      status: statusForMuxEvent(event.type),
    });
  }

  return Response.json({ received: true });
}
