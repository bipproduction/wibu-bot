import { $ } from "bun";

const { stdout, stderr, exitCode,  } = await $`htop`
  .nothrow()
  .quiet();

if (exitCode !== 0) {
  console.log(`Non-zero exit code ${exitCode}`);
}

console.log(stdout.toString("utf-8"));
console.log(stderr.toString("utf-8"));