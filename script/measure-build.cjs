// Comparable emitted JavaScript sizes, not runtime memory or startup benchmarks.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function measure(dir) {
  const files = walk(dir).filter(file => file.endsWith(".js"));
  const sizes = files.map(file => {
    const content = fs.readFileSync(file);
    return { file: path.basename(file), bytes: content.length, gzipBytes: zlib.gzipSync(content).length };
  });
  return {
    files: sizes.length,
    bytes: sizes.reduce((sum, file) => sum + file.bytes, 0),
    gzipBytes: sizes.reduce((sum, file) => sum + file.gzipBytes, 0),
    entries: sizes.filter(file => /^(index|page-ProcessManager|page-AiAdvisor)-/.test(file.file)),
  };
}
console.log(JSON.stringify({
  web: measure("dist/assets"),
  electron: measure("dist-electron/assets"),
  serverBytes: fs.statSync("dist/index.cjs").size,
}, null, 2));
