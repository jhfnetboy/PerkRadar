import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { loadWorkflowSources, workflowViolations } from "../scripts/check-workflows.mjs";

const root = path.resolve(import.meta.dirname, "..");

function violationsOf(source: string, file = ".github/workflows/example.yml"): string[] {
  return workflowViolations([{ path: file, source }], { requireLayout: false });
}

describe("workflow contract", () => {
  it("accepts the workflows in this repository", () => {
    assert.deepEqual(workflowViolations(loadWorkflowSources(root)), []);
  });

  it("rejects runner context in job-level env", () => {
    const violations = violationsOf(`
name: bad
on: push
jobs:
  snapshot:
    runs-on: ubuntu-latest
    env:
      DATA_DIR: \${{ runner.temp }}/db
    steps:
      - run: echo ok
`);
    assert.ok(violations.some((violation) => violation.includes("runner context")));
  });

  it("rejects inlining tests into a job that disables the scheduler", () => {
    const violations = violationsOf(`
name: bad
on: push
jobs:
  snapshot:
    runs-on: ubuntu-latest
    env:
      DISABLE_SCHEDULER: '1'
    steps:
      - run: npm test
`);
    assert.ok(violations.some((violation) => violation.includes("DISABLE_SCHEDULER")));
    assert.ok(violations.some((violation) => violation.includes("inlines npm test")));
  });

  it("rejects a verify workflow that sets the publish scheduler switch", () => {
    const violations = violationsOf(
      `
name: Verify
on:
  workflow_call:
jobs:
  verify:
    runs-on: ubuntu-latest
    env:
      DISABLE_SCHEDULER: '1'
    steps:
      - run: npm test
`,
      ".github/workflows/verify.yml",
    );
    assert.ok(violations.some((violation) => violation.includes("DISABLE_SCHEDULER")));
  });

  it("rejects a snapshot publish job that fetches on pull requests or without the scheduler switch", () => {
    const files = loadWorkflowSources(root).map((file) => {
      if (file.path !== ".github/workflows/snapshot-pages.yml") return file;
      return {
        ...file,
        source: file.source
          .replace("    env:\n      # 只在这个不跑测试的作业里关掉调度，避免一次性抓取再拉起后台轮询。\n      DISABLE_SCHEDULER: '1'\n", "")
          .replaceAll("github.event_name != 'pull_request' && ", ""),
      };
    });
    const violations = workflowViolations(files);
    assert.ok(violations.some((violation) => violation.includes("DISABLE_SCHEDULER=1")));
    assert.ok(violations.some((violation) => violation.includes("must not fetch on pull_request")));
    assert.ok(violations.some((violation) => violation.includes("must not deploy on pull_request")));
  });

  it("the checker CLI fails a repository that reintroduces the job-level runner context", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "perkradar-workflows-"));
    const workflows = path.join(directory, ".github", "workflows");
    fs.mkdirSync(workflows, { recursive: true });
    fs.writeFileSync(
      path.join(workflows, "bad.yml"),
      `name: bad
on: push
jobs:
  snapshot:
    runs-on: ubuntu-latest
    env:
      DATA_DIR: \${{ runner.temp }}/db
    steps:
      - run: echo ok
`,
    );
    let stderr = "";
    try {
      execFileSync(process.execPath, ["scripts/check-workflows.mjs", directory], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      stderr = String((error as { stderr?: string }).stderr ?? error);
    }
    assert.match(stderr, /runner context/);
  });
});
