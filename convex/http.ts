import { httpRouter } from "convex/server";

import { auth } from "./auth";
import { handleFalWebhook } from "./falWebhook";

const http = httpRouter();

auth.addHttpRoutes(http);

// fal webhook živi na Convexu, a ne na Vercelu: fal ne prati redirekcije
// (3xx = trajni neuspeh), a `httpAction` daje sirovo telo bez body parser-a
// (STUDIO-PLAN 4.2).
http.route({
  path: "/fal/webhook",
  method: "POST",
  handler: handleFalWebhook,
});

export default http;
