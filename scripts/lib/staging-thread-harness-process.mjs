import * as NodeFS from "node:fs";

export function parseProcStat(raw) {
  const end = raw.lastIndexOf(")");
  const start = raw.indexOf(" ");
  if (start < 1 || end <= start) throw new Error("process-identity-unavailable");
  const values = raw
    .slice(end + 2)
    .trim()
    .split(/\s+/u);
  if (values.length < 20) throw new Error("process-identity-unavailable");
  return {
    pid: Number(raw.slice(0, start)),
    parentPid: Number(values[1]),
    group: Number(values[2]),
    startTicks: values[19],
  };
}

export function readProcessIdentity(pid, fileSystem = NodeFS) {
  try {
    const row = parseProcStat(fileSystem.readFileSync(`/proc/${pid}/stat`, "utf8"));
    return { pid: row.pid, startTicks: row.startTicks };
  } catch {
    return null;
  }
}

export function identityIsAlive(identity, fileSystem = NodeFS) {
  const current = identity && readProcessIdentity(identity.pid, fileSystem);
  return Boolean(current && current.startTicks === identity.startTicks);
}

export function listProcessRows(fileSystem = NodeFS) {
  return fileSystem
    .readdirSync("/proc")
    .filter((name) => /^\d+$/u.test(name))
    .flatMap((name) => {
      try {
        return [parseProcStat(fileSystem.readFileSync(`/proc/${name}/stat`, "utf8"))];
      } catch {
        return [];
      }
    });
}

export function processBelongsToLaunch(identity, launchIdentity, rows = listProcessRows()) {
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const current = byPid.get(identity.pid);
  if (!current || current.startTicks !== identity.startTicks) return false;
  const leader = byPid.get(launchIdentity.pid);
  if (!leader || leader.startTicks !== launchIdentity.startTicks) return false;
  if (current.group === launchIdentity.pid) return true;
  const visited = new Set();
  let row = current;
  while (row && !visited.has(row.pid)) {
    if (row.pid === launchIdentity.pid && row.startTicks === launchIdentity.startTicks) return true;
    visited.add(row.pid);
    row = byPid.get(row.parentPid);
  }
  return false;
}

export function selectOwnedProcessIdentities(launchIdentity, rows = listProcessRows()) {
  const leader = rows.find(
    (row) => row.pid === launchIdentity?.pid && row.startTicks === launchIdentity?.startTicks,
  );
  if (!leader) return [];
  const selected = new Map([[leader.pid, leader]]);
  for (const row of rows) if (row.group === leader.pid) selected.set(row.pid, row);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) {
      if (!selected.has(row.pid) && selected.has(row.parentPid)) {
        selected.set(row.pid, row);
        changed = true;
      }
    }
  }
  return [...selected.values()].map((row) => ({ pid: row.pid, startTicks: row.startTicks }));
}

export function signalExactOwnedProcess(input, dependencies = {}) {
  const fileSystem = dependencies.fileSystem ?? NodeFS;
  const signal = dependencies.signal ?? process.kill;
  if (!identityIsAlive(input.target, fileSystem)) return false;
  if (
    !processBelongsToLaunch(input.target, input.launch, input.rows ?? listProcessRows(fileSystem))
  ) {
    throw new Error("signal-target-not-owned");
  }
  signal(input.target.pid, input.signal);
  return true;
}

export function signalExactCapturedProcess(input, dependencies = {}) {
  const fileSystem = dependencies.fileSystem ?? NodeFS;
  const signal = dependencies.signal ?? process.kill;
  if (input.captured.get(input.target.pid) !== input.target.startTicks)
    throw new Error("signal-target-not-owned");
  if (!identityIsAlive(input.target, fileSystem)) return false;
  signal(input.target.pid, input.signal);
  return true;
}

export function assertProtectedProcesses(processes, fileSystem = NodeFS) {
  for (const processIdentity of processes) {
    if (!identityIsAlive(processIdentity, fileSystem)) throw new Error("protected-process-changed");
  }
}
