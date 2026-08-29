const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("publisher icon map has unique keys and preserves canonical vendors", async () => {
  const sourcePath = path.join(__dirname, "../../client/src/lib/publisherIcons.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const start = source.indexOf("const PUBLISHER_DOMAINS");
  const end = source.indexOf("};", start);
  assert.ok(start >= 0 && end > start);

  const mapBody = source.slice(start, end);
  const keys = [...mapBody.matchAll(/^\s*"([^"]+)":/gm)].map((match) => match[1]);
  assert.equal(keys.length, new Set(keys).size, "publisher map contains a duplicate key");

  const { publisherToDomain } = await import("../../client/src/lib/publisherIcons.ts");
  assert.equal(publisherToDomain("NVIDIA Corporation", "nvcontainer.exe"), "nvidia.com");
  assert.equal(publisherToDomain("Advanced Micro Devices, Inc.", "amdnoise.exe"), "amd.com");
  assert.equal(publisherToDomain("Realtek Semiconductor Corp.", "rtaudioservice.exe"), "realtek.com");
  assert.equal(publisherToDomain("Epic Games, Inc.", "EpicGamesLauncher.exe"), "epicgames.com");
});