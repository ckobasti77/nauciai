import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";

import { convexMutations, getConvexHttpClient } from "@/lib/convex-http";
import { missingServerEnvName } from "@/lib/env";
import { createMuxDirectUpload } from "@/lib/mux";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const lessonId = typeof body.lessonId === "string" ? body.lessonId : undefined;
  if (!lessonId) {
    return Response.json({ error: "Missing lessonId" }, { status: 400 });
  }

  try {
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const upload = await createMuxDirectUpload(origin);
    const token = await convexAuthNextjsToken();
    const convex = getConvexHttpClient(token);

    if (convex) {
      await convex.mutation(convexMutations.attachMuxUpload, {
        lessonId,
        muxUploadId: upload.id,
      });
    }

    return Response.json({
      uploadId: upload.id,
      url: upload.url,
      timeout: upload.timeout,
    });
  } catch (error) {
    const missingEnv = missingServerEnvName(error);
    return Response.json(
      {
        error: missingEnv
          ? `Mux is not configured. Set ${missingEnv} before creating direct uploads.`
          : "Unable to create a Mux direct upload.",
      },
      { status: missingEnv ? 503 : 500 },
    );
  }
}
