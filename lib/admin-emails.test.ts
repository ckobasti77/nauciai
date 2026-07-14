import { describe, expect, it } from "vitest";

import { parseAdminEmails } from "./admin-emails";

describe("parseAdminEmails", () => {
  it("normalizes comma, semicolon and newline separated allowlists", () => {
    expect([...parseAdminEmails(" Jovan@Example.com, alexa_gior3@gmail.com;\nADMIN@SITE.RS ")]).toEqual([
      "jovan@example.com",
      "alexa_gior3@gmail.com",
      "admin@site.rs",
    ]);
  });
});
