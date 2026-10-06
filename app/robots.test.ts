import { expect, test } from "vitest";

import robots from "./robots";

test("OG slika deljene knjižice je dozvoljena, ostatak `/api/` nije (K30, K29 S-04)", () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0]! : rules;
  expect(rule.allow).toContain("/api/crea/knjizica/");
  expect(rule.disallow).toContain("/api/");
  expect(rule.allow).toContain("/crea");
  expect(rule.disallow).toContain("/crea/app");
});
