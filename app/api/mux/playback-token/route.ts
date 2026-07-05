import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexQueries, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { signMuxPlayback } from "@/lib/mux";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const playbackId = typeof body.playbackId === "string" ? body.playbackId : undefined;
  if (!playbackId) {
    return Response.json({ error: "Missing playbackId" }, { status: 400 });
  }

  const courseSlug = typeof body.courseSlug === "string" ? body.courseSlug : undefined;
  const lessonSlug = typeof body.lessonSlug === "string" ? body.lessonSlug : undefined;
  const token = await convexAuthNextjsToken();
  const convex = getConvexHttpClient(token);

  if (convex && courseSlug && lessonSlug) {
    await convex.query(convexQueries.getLessonForStudent, { courseSlug, lessonSlug });
  }

  try {
    const tokens = await signMuxPlayback(playbackId);
    return Response.json(tokens);
  } catch (error) {
    const missingEnv = missingServerEnvName(error);
    return Response.json(
      {
        error: missingEnv
          ? `Mux signed playback is not configured. Set ${missingEnv} before requesting playback tokens.`
          : "Unable to sign Mux playback tokens.",
      },
      { status: missingEnv ? 503 : 500 },
    );
  }
}
