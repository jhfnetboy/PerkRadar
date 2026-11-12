import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const VERIFY = ".github/workflows/verify.yml";
const CI = ".github/workflows/ci.yml";
const SNAPSHOT = ".github/workflows/snapshot-pages.yml";
const VERIFY_USES = "./.github/workflows/verify.yml";
const VERIFY_COMMANDS = [
  "npm test",
  "npm run lint",
  "npx tsc --noEmit --incremental false",
  "npm run build",
  "npm run build:snapshot",
  "npm audit --omit=dev --registry=https://registry.npmjs.org",
];

/** Drop surrounding quotes and an end-of-line comment from a YAML scalar. */
function parseScalar(raw) {
  const trimmed = raw.replace(/\s+#.*$/, "").trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function indentOf(line) {
  return line.match(/^ */)?.[0].length ?? 0;
}

function isBlockScalar(line) {
  return /:\s*[|>][+-]?\s*(#.*)?$/.test(line);
}

/** Call `onLine` for mapping lines. Block-scalar bodies are kept off that path. */
function walk(source, onLine) {
  const lines = source.split("\n");
  let blockIndent = -1;
  let block = null;
  const flush = () => {
    if (!block) return;
    onLine(block.line, block.text, block.body);
    block = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = indentOf(line);
    if (blockIndent >= 0) {
      if (line.trim() === "" || indent > blockIndent) {
        if (block) block.body.push(line);
        continue;
      }
      blockIndent = -1;
      flush();
    }
    if (isBlockScalar(line)) {
      blockIndent = indent;
      block = { line, text: line, body: [] };
      continue;
    }
    onLine(line, line, []);
  }
  flush();
}

function onSection(source) {
  const lines = [];
  let capturing = false;
  walk(source, (line, text) => {
    if (indentOf(text) === 0 && text.trim() !== "") {
      capturing = /^on:/.test(text);
    }
    if (capturing) lines.push(line);
  });
  return lines.join("\n");
}

function splitJobs(source) {
  /** @type {{id: string, line: number, body: string[]}[]} */
  const jobs = [];
  let inJobs = false;
  let current = null;
  const lines = source.split("\n");
  let blockIndent = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const indent = indentOf(line);
    if (blockIndent >= 0) {
      if (line.trim() === "" || indent > blockIndent) {
        if (current) current.body.push(line);
        continue;
      }
      blockIndent = -1;
    }
    if (isBlockScalar(line)) {
      blockIndent = indent;
      if (current) current.body.push(line);
      continue;
    }
    if (/^jobs:\s*(#.*)?$/.test(line)) {
      inJobs = true;
      current = null;
      continue;
    }
    if (inJobs && indent === 0 && line.trim() !== "") {
      inJobs = false;
      current = null;
    }
    if (!inJobs) continue;
    const header = line.match(/^  ([A-Za-z0-9_-]+):\s*(#.*)?$/);
    if (header) {
      current = { id: header[1], line: index + 1, body: [] };
      jobs.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return jobs.map((job) => ({ id: job.id, line: job.line, body: job.body.join("\n") }));
}

function parseEnvBlock(lines) {
  /** @type {{key: string, value: string}[]} */
  const env = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (match) env.push({ key: match[1], value: parseScalar(match[2] ?? "") });
  }
  return env;
}

function parseJob(job) {
  const bodyLines = job.body.split("\n");
  let phase = "job";
  /** @type {{key: string, value: string}[]} */
  let jobEnv = [];
  let collectingJobEnv = false;
  let jobEnvLines = [];
  let ifText = "";
  let uses = "";
  let needs = false;
  /** @type {{env: {key: string, value: string}[], run: string, uses: string}[]} */
  const steps = [];
  let step = null;
  let collectingStepEnv = false;
  let stepEnvLines = [];
  let runLines = null;

  const finishStepEnv = () => {
    if (!collectingStepEnv || !step) return;
    step.env.push(...parseEnvBlock(stepEnvLines));
    collectingStepEnv = false;
    stepEnvLines = [];
  };

  for (const line of bodyLines) {
    const indent = indentOf(line);
    if (phase === "job" && /^    steps:\s*(#.*)?$/.test(line)) {
      if (collectingJobEnv) {
        jobEnv = parseEnvBlock(jobEnvLines);
        collectingJobEnv = false;
      }
      phase = "steps";
      continue;
    }
    if (phase === "job") {
      if (/^    needs:/.test(line)) needs = true;
      const ifMatch = line.match(/^    if:\s*(.*)$/);
      if (ifMatch) ifText = parseScalar(ifMatch[1]);
      const usesMatch = line.match(/^    uses:\s*(.*)$/);
      if (usesMatch) uses = parseScalar(usesMatch[1]);
      if (/^    env:\s*(#.*)?$/.test(line)) {
        collectingJobEnv = true;
        jobEnvLines = [];
        continue;
      }
      if (collectingJobEnv) {
        if (indent >= 6) {
          jobEnvLines.push(line.trim());
          continue;
        }
        jobEnv = parseEnvBlock(jobEnvLines);
        collectingJobEnv = false;
      }
      continue;
    }
    if (/^      - /.test(line)) {
      finishStepEnv();
      if (runLines && step) {
        step.run = runLines.join("\n");
        runLines = null;
      }
      step = { env: [], run: "", uses: "" };
      steps.push(step);
      const inlineRun = line.match(/^      - run:\s*(.*)$/);
      if (inlineRun && !/^[|>][+-]?$/.test(inlineRun[1].trim())) step.run = parseScalar(inlineRun[1]);
      const inlineUses = line.match(/^      - uses:\s*(.*)$/);
      if (inlineUses) step.uses = parseScalar(inlineUses[1]);
      continue;
    }
    if (!step) continue;
    if (runLines) {
      if (line.trim() === "" || indent > runLines.indent) {
        runLines.push(line);
        continue;
      }
      step.run = runLines.join("\n");
      runLines = null;
    }
    if (/^        env:\s*(#.*)?$/.test(line)) {
      collectingStepEnv = true;
      stepEnvLines = [];
      continue;
    }
    if (collectingStepEnv) {
      if (indent >= 10) {
        stepEnvLines.push(line.trim());
        continue;
      }
      finishStepEnv();
    }
    const runMatch = line.match(/^        run:\s*(.*)$/);
    if (runMatch) {
      const rest = runMatch[1].trim();
      if (/^[|>][+-]?$/.test(rest)) {
        runLines = [];
        runLines.indent = indent;
      } else {
        step.run = parseScalar(runMatch[1]);
      }
      continue;
    }
    const usesMatch = line.match(/^        uses:\s*(.*)$/);
    if (usesMatch) step.uses = parseScalar(usesMatch[1]);
  }
  finishStepEnv();
  if (runLines && step) step.run = runLines.join("\n");
  if (collectingJobEnv) jobEnv = parseEnvBlock(jobEnvLines);
  return { id: job.id, line: job.line, ifText, uses, needs, jobEnv, steps };
}

function envLookup(env, key) {
  for (let index = env.length - 1; index >= 0; index -= 1) {
    if (env[index].key === key) return env[index].value;
  }
  return undefined;
}

function effectiveEnv(jobEnv, stepEnv) {
  const merged = [...jobEnv];
  for (const entry of stepEnv) {
    const existing = merged.findIndex((item) => item.key === entry.key);
    if (existing >= 0) merged.splice(existing, 1);
    merged.push(entry);
  }
  return merged;
}

function excludesPullRequest(ifText) {
  return ifText.includes("github.event_name != 'pull_request'") || ifText.includes('github.event_name != "pull_request"');
}

function runsNpmTest(run) {
  return /(^|\n)\s*npm test(\s|$)/.test(run);
}

/**
 * @param {{path: string, source: string}[]} files
 * @param {{requireLayout?: boolean}} [options]
 * @returns {string[]}
 */
export function workflowViolations(files, options = {}) {
  const requireLayout = options.requireLayout !== false;
  /** @type {string[]} */
  const violations = [];
  const byPath = new Map(files.map((file) => [file.path.replaceAll("\\", "/"), file.source]));

  if (requireLayout) {
    for (const required of [VERIFY, CI, SNAPSHOT]) {
      if (!byPath.has(required)) violations.push(`${required} is required`);
    }
    const ci = byPath.get(CI) ?? "";
    if (ci && !ci.includes(`uses: ${VERIFY_USES}`)) violations.push(`${CI} must call ${VERIFY_USES}`);
    if (ci && !ci.includes("https://github.com/rhysd/actionlint/releases/download/")) {
      violations.push(`${CI} must install pinned actionlint from the official release`);
    }
    if (ci && !ci.includes("sha256sum -c -")) violations.push(`${CI} must verify the actionlint checksum`);
    if (ci && !/\.\/actionlint\b/.test(ci)) violations.push(`${CI} must run actionlint`);
    const verify = byPath.get(VERIFY) ?? "";
    if (verify && !/^on:\n(?:[ \t].*\n)*?[ \t]+workflow_call:/m.test(`${verify}\n`)) {
      violations.push(`${VERIFY} must be a workflow_call workflow`);
    }
    for (const command of VERIFY_COMMANDS) {
      if (verify && !verify.includes(command)) violations.push(`${VERIFY} is missing \`${command}\``);
    }
  }

  for (const [filePath, source] of byPath) {
    const jobs = splitJobs(source).map((job) => ({ ...parseJob(job), body: job.body }));
    const triggers = onSection(source);
    const acceptsPullRequest = /^[ \t]+pull_request:/m.test(triggers) || /\bpull_request\b/.test(triggers.split("\n")[0] ?? "");

    for (const job of jobs) {
      for (const entry of job.jobEnv) {
        if (entry.value.includes("runner.")) {
          violations.push(`${filePath} job ${job.id} sets ${entry.key} from the runner context at job level`);
        }
      }
      const runsTests = job.steps.some((step) => runsNpmTest(step.run));
      if (runsTests) {
        for (const entry of [...job.jobEnv, ...job.steps.flatMap((step) => step.env)]) {
          if (entry.key === "DISABLE_SCHEDULER" || entry.key === "DATA_DIR" || entry.key === "DEALS_SNAPSHOT_DIR") {
            violations.push(`${filePath} job ${job.id} runs npm test with ${entry.key} set`);
          }
        }
      }
      if (filePath !== VERIFY) {
        for (const step of job.steps) {
          if (runsNpmTest(step.run)) violations.push(`${filePath} job ${job.id} inlines npm test; call ${VERIFY_USES} instead`);
        }
      }
      const sensitive = job.body.includes("secrets.") || job.steps.some((step) => step.uses.includes("actions/deploy-pages"));
      if (acceptsPullRequest && sensitive && !excludesPullRequest(job.ifText)) {
        violations.push(`${filePath} job ${job.id} reads secrets or deploys and can run on pull_request`);
      }
      if (job.needs && job.ifText && !job.ifText.includes("success()")) {
        violations.push(`${filePath} job ${job.id} replaces the default success() check`);
      }
    }

    if (filePath === SNAPSHOT) {
      if (!acceptsPullRequest) violations.push(`${SNAPSHOT} must run on pull_request so a broken publish job fails in PR CI`);
      if (!jobs.some((job) => job.uses === VERIFY_USES)) violations.push(`${SNAPSHOT} must call ${VERIFY_USES}`);
      const publish = jobs.find((job) => job.steps.some((step) => step.run.includes("npm run report")));
      if (!publish) violations.push(`${SNAPSHOT} must keep the isolated source fetch`);
      else {
        if (!excludesPullRequest(publish.ifText)) violations.push(`${SNAPSHOT} job ${publish.id} must not fetch on pull_request`);
        const report = publish.steps.find((step) => step.run.includes("npm run report"));
        const scheduler = envLookup(effectiveEnv(publish.jobEnv, report?.env ?? []), "DISABLE_SCHEDULER");
        if (scheduler !== "1") violations.push(`${SNAPSHOT} fetch must run with DISABLE_SCHEDULER=1`);
        const exportStep = publish.steps.find((step) => step.run.includes("scripts/write-snapshot.ts"));
        if (!exportStep) violations.push(`${SNAPSHOT} must keep the snapshot export step`);
        else if (envLookup(effectiveEnv(publish.jobEnv, exportStep.env), "DISABLE_SCHEDULER") !== "1") {
          violations.push(`${SNAPSHOT} export must run with DISABLE_SCHEDULER=1`);
        }
      }
      const deploy = jobs.find((job) => job.steps.some((step) => step.uses.includes("actions/deploy-pages")));
      if (!deploy) violations.push(`${SNAPSHOT} must keep the Pages deploy job`);
      else if (!excludesPullRequest(deploy.ifText)) violations.push(`${SNAPSHOT} job ${deploy.id} must not deploy on pull_request`);
    }
  }

  return violations;
}

export function loadWorkflowSources(root) {
  const directory = path.join(root, ".github", "workflows");
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort()
    .map((name) => ({
      path: `.github/workflows/${name}`,
      source: fs.readFileSync(path.join(directory, name), "utf8"),
    }));
}

function main() {
  const root = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const violations = workflowViolations(loadWorkflowSources(root));
  if (violations.length === 0) {
    console.log(`workflow contract ok (${root})`);
    return;
  }
  for (const violation of violations) console.error(violation);
  process.exitCode = 1;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) main();
