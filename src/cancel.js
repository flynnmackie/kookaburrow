// Cancelling a running hunt or response. Each run that is in progress has an AbortController; cancelling aborts it, which stops the
// connection to the host that is being worked on (the local powershell.exe or SSH session is ended) and makes the runner skip
// everything that has not started yet. What was already collected is kept.
const live = new Map(); // run id -> AbortController

function begin(runId) {
  const ac = new AbortController();
  live.set(runId, ac);
  return ac.signal;
}
function end(runId) { live.delete(runId); }
// true when the run was in progress in this server process; false for a run left as "running" by an earlier server process
function cancel(runId) {
  const ac = live.get(runId);
  if (!ac) return false;
  ac.abort();
  return true;
}

module.exports = { begin, end, cancel };
