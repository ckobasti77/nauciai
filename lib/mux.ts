import "server-only";

import Mux from "@mux/mux-node";

import { requireServerEnv } from "./env";

let muxClient: Mux | null = null;

export function getMux(): Mux {
  if (!muxClient) {
    muxClient = new Mux({
      tokenId: requireServerEnv("MUX_TOKEN_ID"),
      tokenSecret: requireServerEnv("MUX_TOKEN_SECRET"),
      webhookSecret: process.env.MUX_WEBHOOK_SECRET,
      jwtSigningKey: process.env.MUX_SIGNING_KEY,
      jwtPrivateKey: process.env.MUX_PRIVATE_KEY,
    });
  }

  return muxClient;
}

export async function createMuxDirectUpload(corsOrigin: string) {
  const mux = getMux();

  return mux.video.uploads.create({
    cors_origin: corsOrigin,
    new_asset_settings: {
      playback_policies: ["signed"],
      mp4_support: "standard",
    },
    timeout: 3600,
  });
}

export async function signMuxPlayback(playbackId: string) {
  const mux = getMux();

  const tokens = await mux.jwt.signPlaybackId(playbackId, {
    expiration: "4h",
    type: ["video", "thumbnail", "storyboard"],
  });

  return tokens;
}
