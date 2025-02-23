import { describe, expect, test } from "bun:test";
import { $ } from "bun";

const cmd = `
curl -X POST http://localhost:3150/api/file \
     -H "Content-Type: multipart/form-data" \
     -F "file=@./README.md"
`;

test("upload file", async () => {
  const output = await $`${cmd}`.text();
  expect(output).toInclude("http");
});
