import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vite-plus/test";

// A default parameter that calls a function (`(selection = readSelection()) =>`)
// is miscompiled when a product re-bundles the built aa.js with Rolldown: the
// call binds to a same-named outer function, and the editor throws as it draws.
// Read such values in the function's body instead.
test("no arrow function's default parameter calls a function", () => {
  const folder = join(process.cwd(), "src");
  const offenders = readdirSync(folder)
    .filter((name) => name.endsWith(".ts"))
    .flatMap((name) =>
      [...readFileSync(join(folder, name), "utf8").matchAll(/\(\s*\w+\s*(?::[^)=]*)?=\s*\w+\([^)]*\)\s*\)\s*=>/g)].map(
        (match) => `${name}: ${match[0]}`,
      ),
    );
  expect(offenders).toEqual([]);
});
