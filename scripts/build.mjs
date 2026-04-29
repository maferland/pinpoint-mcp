#!/usr/bin/env bun
import { execSync } from "child_process";
import { renameSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

rmSync(join(root, "dist"), { recursive: true, force: true });

run("bunx tsc --noEmit");
run("bunx vite build");

renameSync(
  join(root, "dist", "src", "annotator.html"),
  join(root, "dist", "annotator.html")
);
rmSync(join(root, "dist", "src"), { recursive: true, force: true });

run("bunx tsc -p tsconfig.server.json");
run('bun build src/server.ts --outdir dist --target node');
run('bun build src/main.ts --outfile dist/index.js --target node --banner "#!/usr/bin/env node"');
run('bun build src/cli.ts --outfile dist/cli.js --target node --banner "#!/usr/bin/env node"');
