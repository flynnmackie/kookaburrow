// Generates the Kibana saved objects (data view, saved search, visualizations, dashboards) as NDJSON.
//   node elastic/kibana/build.js [out.ndjson]            writes the plain objects (default: kookaburrow-dashboards.source.ndjson next to this file)
// The shipped file, kookaburrow-dashboards.ndjson, is this output imported into a Kibana 8.19 and exported again, so every object carries Kibana's own
// migration versions (see elastic/kibana/README.md). Fields used by the charts are the ones every Kookaburrow document has (mapped by the index template,
// see src/elastic.js) plus kookaburrow.data.<Column>.keyword for the workflow outputs.
const fs = require('fs');
const path = require('path');

const DV = 'kookaburrow-data-view';
const IDX = 'kibanaSavedObjectMeta.searchSourceJSON.index';
const dvRef = [{ name: IDX, type: 'index-pattern', id: DV }];
const searchSource = (query = '') => JSON.stringify({ query: { query, language: 'kuery' }, filter: [], indexRefName: IDX });
const objects = [];

objects.push({
  id: DV, type: 'index-pattern',
  attributes: { title: 'kookaburrow-*', name: 'Kookaburrow', timeFieldName: '@timestamp', fields: '[]', fieldFormatMap: '{}', fieldAttrs: '{}', runtimeFieldMap: '{}', sourceFilters: '[]', typeMeta: '{}', allowNoIndex: true },
  references: [],
});

// ---- aggregations ----
const count = (id, label) => ({ id, enabled: true, type: 'count', params: label ? { customLabel: label } : {}, schema: 'metric' });
const card = (id, field, label) => ({ id, enabled: true, type: 'cardinality', params: { field, ...(label ? { customLabel: label } : {}) }, schema: 'metric' });
const max = (id, field, label) => ({ id, enabled: true, type: 'max', params: { field, ...(label ? { customLabel: label } : {}) }, schema: 'metric' });
const terms = (id, field, size, schema, { orderBy = '1', order = 'desc', label } = {}) => ({
  id, enabled: true, type: 'terms',
  params: { field, orderBy, order, size, otherBucket: false, otherBucketLabel: 'Other', missingBucket: false, missingBucketLabel: 'Missing', ...(label ? { customLabel: label } : {}) },
  schema,
});
// buckets defined by queries, for things with no field of their own (a document without kookaburrow.scheduled is a manual run)
const filters = (id, schema, list) => ({ id, enabled: true, type: 'filters', params: { filters: list.map(([q, label]) => ({ input: { query: q, language: 'kuery' }, label })) }, schema });
const dateHist = (id, schema = 'segment', interval = 'auto') => ({
  id, enabled: true, type: 'date_histogram',
  params: { field: '@timestamp', useNormalizedEsInterval: true, extendToTimeRange: false, scaleMetricValues: false, interval, used_interval: interval === 'auto' ? '0ms' : `1${interval}`, drop_partials: false, min_doc_count: 1, extended_bounds: {} },
  schema,
});

// ---- visualization types ----
const axes = (cat, val, mode, kind, label) => ({
  type: kind, grid: { categoryLines: false },
  categoryAxes: [{ id: 'CategoryAxis-1', type: 'category', position: cat, show: true, style: {}, scale: { type: 'linear' }, labels: { show: true, filter: true, truncate: 100 }, title: {} }],
  valueAxes: [{ id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: val, show: true, style: {}, scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 }, title: { text: label } }],
  seriesParams: [{ show: true, type: kind === 'line' ? 'line' : kind === 'area' ? 'area' : 'histogram', mode, data: { label, id: '1' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, lineWidth: 2, showCircles: true, interpolate: 'linear' }],
  addTooltip: true, addLegend: true, legendPosition: 'right', times: [], addTimeMarker: false, labels: { show: false }, thresholdLine: { show: false, value: 10, width: 1, style: 'full', color: '#E7664C' },
});
const PARAMS = {
  metric: () => ({ addTooltip: true, addLegend: false, type: 'metric', metric: { percentageMode: false, useRanges: false, colorSchema: 'Green to Red', metricColorMode: 'None', colorsRange: [{ from: 0, to: 10000 }], labels: { show: true }, invertColors: false, style: { bgFill: '#000', bgColor: false, labelColor: false, subText: '', fontSize: 36 } } }),
  pie: () => ({ type: 'pie', addTooltip: true, addLegend: true, legendPosition: 'right', isDonut: true, labels: { show: false, values: true, last_level: true, truncate: 100 } }),
  histogram: (l) => axes('bottom', 'left', 'stacked', 'histogram', l),
  horizontal_bar: (l) => axes('left', 'bottom', 'normal', 'horizontal_bar', l),
  line: (l) => axes('bottom', 'left', 'normal', 'line', l),
  table: () => ({ perPage: 10, showPartialRows: false, showMetricsAtAllLevels: false, showTotal: false, totalFunc: 'sum', percentageCol: '' }),
};
function vis(id, title, type, aggs, { query = '', label = 'Rows', description = '' } = {}) {
  objects.push({
    id: `kookaburrow-vis-${id}`, type: 'visualization',
    attributes: { title, description, visState: JSON.stringify({ title, type, aggs, params: PARAMS[type](label) }), uiStateJSON: '{}', version: 1, kibanaSavedObjectMeta: { searchSourceJSON: searchSource(query) } },
    references: dvRef,
  });
  return { type: 'visualization', id: `kookaburrow-vis-${id}` };
}
function search(id, title, columns, query = '') {
  objects.push({
    id: `kookaburrow-search-${id}`, type: 'search',
    attributes: { title, description: '', columns, sort: [['@timestamp', 'desc']], grid: {}, hideChart: false, isTextBasedQuery: false, kibanaSavedObjectMeta: { searchSourceJSON: searchSource(query) } },
    references: dvRef,
  });
  return { type: 'search', id: `kookaburrow-search-${id}` };
}
// panels: [[ref, x, y, w, h], ...] on Kibana's 48 column grid
function dashboard(id, title, description, panels) {
  const refs = [], list = [];
  panels.forEach(([ref, x, y, w, h], i) => {
    const n = String(i + 1);
    list.push({ type: ref.type, gridData: { x, y, w, h, i: n }, panelIndex: n, embeddableConfig: {}, panelRefName: `panel_${n}` });
    refs.push({ name: `panel_${n}`, type: ref.type, id: ref.id });
  });
  objects.push({
    id: `kookaburrow-dashboard-${id}`, type: 'dashboard',
    attributes: {
      title, description, hits: 0, timeRestore: true, timeFrom: 'now-30d', timeTo: 'now', refreshInterval: { pause: true, value: 0 },
      optionsJSON: JSON.stringify({ useMargins: true, syncColors: false, syncCursor: true, syncTooltips: false, hidePanelTitles: false }),
      panelsJSON: JSON.stringify(list), version: 1, kibanaSavedObjectMeta: { searchSourceJSON: JSON.stringify({ query: { query: '', language: 'kuery' }, filter: [] }) },
    },
    references: refs,
  });
}

const F = { run: 'kookaburrow.run_id', hunt: 'kookaburrow.hunt', user: 'kookaburrow.run_by', sched: 'kookaburrow.scheduled', coll: 'kookaburrow.collection', wf: 'kookaburrow.workflow', proc: 'kookaburrow.processor', host: 'host.name' };
const D = (c) => `kookaburrow.data.${c}.keyword`;

// ---- 1. Overview ----
{
  const hunts = vis('ov-hunts', 'Hunts', 'metric', [card('1', F.run, 'Hunts')]);
  const rows = vis('ov-rows', 'Rows', 'metric', [count('1', 'Rows')]);
  const hosts = vis('ov-hosts', 'Hosts', 'metric', [card('1', F.host, 'Hosts')]);
  const colls = vis('ov-colls', 'Collections', 'metric', [card('1', F.coll, 'Collections')]);
  const time = vis('ov-time', 'Rows over time by collection', 'histogram', [count('1'), dateHist('2'), terms('3', F.coll, 8, 'group')]);
  const byColl = vis('ov-coll', 'Rows by collection', 'pie', [count('1'), terms('2', F.coll, 12, 'segment')]);
  const byHost = vis('ov-host', 'Rows by host (top 10)', 'horizontal_bar', [count('1'), terms('2', F.host, 10, 'segment')]);
  const byUser = vis('ov-user', 'Rows by user', 'pie', [count('1'), terms('2', F.user, 10, 'segment')]);
  const recent = vis('ov-recent', 'Recent hunts', 'table', [count('1', 'Rows'), card('2', F.host, 'Hosts'), max('3', '@timestamp', 'Last row'), terms('4', F.hunt, 15, 'bucket', { orderBy: '3', label: 'Hunt' }), terms('5', F.user, 3, 'bucket', { orderBy: '1', label: 'Run by' })]);
  const latest = search('latest', 'Kookaburrow - Latest rows', ['host.name', 'kookaburrow.collection', 'kookaburrow.hunt', 'kookaburrow.run_by']);
  dashboard('overview', 'Kookaburrow - Overview', 'Hunts, rows, hosts and collections at a glance, and the latest rows.', [
    [hunts, 0, 0, 12, 7], [rows, 12, 0, 12, 7], [hosts, 24, 0, 12, 7], [colls, 36, 0, 12, 7],
    [time, 0, 7, 32, 16], [byColl, 32, 7, 16, 16],
    [byHost, 0, 23, 24, 15], [byUser, 24, 23, 24, 15],
    [recent, 0, 38, 48, 14], [latest, 0, 52, 48, 18],
  ]);
}

// ---- 2. Users ----
{
  const per = vis('us-hunts', 'Hunts per user', 'horizontal_bar', [card('1', F.run, 'Hunts'), terms('2', F.user, 15, 'segment')], { label: 'Hunts' });
  const kind = vis('us-sched', 'Manual and scheduled hunts', 'pie', [card('1', F.run, 'Hunts'), filters('2', 'segment', [[`${F.sched} : true`, 'Scheduled'], [`NOT ${F.sched} : true`, 'Manual']])]);
  const time = vis('us-time', 'Rows over time by user', 'histogram', [count('1'), dateHist('2'), terms('3', F.user, 8, 'group')]);
  const users = vis('us-table', 'Users', 'table', [count('1', 'Rows'), card('2', F.run, 'Hunts'), card('3', F.host, 'Hosts'), max('4', '@timestamp', 'Last activity'), terms('5', F.user, 20, 'bucket', { orderBy: '4', label: 'User' })]);
  const grid = vis('us-coll', 'Rows per user and collection', 'table', [count('1', 'Rows'), terms('2', F.user, 15, 'bucket', { label: 'User' }), terms('3', F.coll, 15, 'bucket', { label: 'Collection' })]);
  dashboard('users', 'Kookaburrow - Users', 'Who runs hunts: hunts, rows and activity per user (kookaburrow.run_by).', [
    [per, 0, 0, 24, 14], [kind, 24, 0, 24, 14], [time, 0, 14, 48, 15], [users, 0, 29, 24, 15], [grid, 24, 29, 24, 15],
  ]);
}

// ---- 3. Workflows ----
{
  const wRows = vis('wf-rows', 'Workflow rows', 'metric', [count('1', 'Rows')], { query: `${F.proc} : *` });
  const wProc = vis('wf-proc', 'Rows by processor', 'pie', [count('1'), terms('2', F.proc, 15, 'segment')], { query: `${F.proc} : *` });
  const wFlow = vis('wf-flow', 'Rows by workflow', 'horizontal_bar', [count('1'), terms('2', F.wf, 12, 'segment')], { query: `${F.wf} : *` });
  const HB = `${F.proc} : "hayabusa"`;
  const hLevel = vis('hb-level', 'Hayabusa detections by level', 'pie', [count('1'), terms('2', D('Level'), 6, 'segment')], { query: HB });
  const hRules = vis('hb-rules', 'Hayabusa top rules', 'table', [count('1', 'Detections'), card('2', F.host, 'Hosts'), terms('3', D('RuleTitle'), 15, 'bucket', { label: 'Rule' }), terms('4', D('Level'), 3, 'bucket', { label: 'Level' })], { query: HB });
  const hTime = vis('hb-time', 'Hayabusa detections over time by level', 'histogram', [count('1'), dateHist('2'), terms('3', D('Level'), 6, 'group')], { query: HB });
  const hHost = vis('hb-host', 'Hayabusa detections by host', 'horizontal_bar', [count('1'), terms('2', F.host, 10, 'segment')], { query: HB });
  const EV = `${F.proc} : "evtxecmd"`;
  const eIds = vis('ev-ids', 'EvtxECmd top event IDs', 'table', [count('1', 'Events'), terms('2', D('EventId'), 15, 'bucket', { label: 'Event ID' }), terms('3', D('Provider'), 2, 'bucket', { label: 'Provider' })], { query: EV });
  const eChan = vis('ev-chan', 'EvtxECmd events by channel', 'pie', [count('1'), terms('2', D('Channel'), 10, 'segment')], { query: EV });
  const cDet = vis('cs-det', 'Chainsaw detections', 'table', [count('1', 'Hits'), card('2', F.host, 'Hosts'), terms('3', D('detections'), 15, 'bucket', { label: 'Detection' })], { query: `${F.proc} : "chainsaw"` });
  const zRules = vis('zc-rules', 'Zircolite rules', 'table', [count('1', 'Hits'), card('2', F.host, 'Hosts'), terms('3', D('RuleTitle'), 15, 'bucket', { label: 'Rule' }), terms('4', D('Level'), 3, 'bucket', { label: 'Level' })], { query: `${F.proc} : "zircolite"` });
  dashboard('workflows', 'Kookaburrow - Workflow results', 'What workflows produced: Hayabusa, EvtxECmd, Chainsaw and Zircolite output, and rows per workflow and processor.', [
    [wRows, 0, 0, 12, 7], [wProc, 12, 0, 18, 14], [wFlow, 30, 0, 18, 14],
    [hLevel, 0, 14, 16, 15], [hTime, 16, 14, 32, 15], [hRules, 0, 29, 28, 16], [hHost, 28, 29, 20, 16],
    [eIds, 0, 45, 28, 15], [eChan, 28, 45, 20, 15], [cDet, 0, 60, 24, 15], [zRules, 24, 60, 24, 15],
  ]);
}

// ---- 4. Hosts ----
{
  const hosts = vis('ho-table', 'Hosts', 'table', [count('1', 'Rows'), card('2', F.run, 'Hunts'), card('3', F.coll, 'Collections'), max('4', '@timestamp', 'Last row'), terms('5', F.host, 30, 'bucket', { orderBy: '4', label: 'Host' })]);
  const time = vis('ho-time', 'Rows over time by host', 'histogram', [count('1'), dateHist('2'), terms('3', F.host, 8, 'group')]);
  const grid = vis('ho-grid', 'Collections per host (rows)', 'table', [count('1', 'Rows'), terms('2', F.host, 20, 'bucket', { label: 'Host' }), terms('3', F.coll, 20, 'bucket', { label: 'Collection' })]);
  const colls = vis('ho-colls', 'Collections per host', 'horizontal_bar', [card('1', F.coll, 'Collections'), terms('2', F.host, 15, 'segment')], { label: 'Collections' });
  dashboard('hosts', 'Kookaburrow - Hosts', 'Coverage per host: what was collected, how much, and when it was last seen.', [
    [hosts, 0, 0, 48, 15], [time, 0, 15, 30, 15], [colls, 30, 15, 18, 15], [grid, 0, 30, 48, 18],
  ]);
}

// ---- 5. Recurring ----
{
  const S = `${F.sched} : true`;
  const table = vis('rc-table', 'Scheduled hunts', 'table', [card('1', F.run, 'Runs'), count('2', 'Rows'), card('3', F.host, 'Hosts'), max('4', '@timestamp', 'Last run'), terms('5', F.hunt, 20, 'bucket', { orderBy: '4', label: 'Hunt' })], { query: S });
  const runs = vis('rc-runs', 'Runs per day by hunt', 'histogram', [card('1', F.run, 'Runs'), dateHist('2', 'segment', 'd'), terms('3', F.hunt, 8, 'group')], { query: S, label: 'Runs' });
  const rows = vis('rc-rows', 'Rows over time by hunt', 'histogram', [count('1'), dateHist('2'), terms('3', F.hunt, 8, 'group')], { query: S });
  const kind = vis('rc-kind', 'Scheduled and manual rows', 'pie', [count('1'), filters('2', 'segment', [[`${F.sched} : true`, 'Scheduled'], [`NOT ${F.sched} : true`, 'Manual']])]);
  dashboard('recurring', 'Kookaburrow - Recurring hunts', 'Hunts started by a recurring schedule: how often they ran and what they found.', [
    [table, 0, 0, 36, 15], [kind, 36, 0, 12, 15], [runs, 0, 15, 24, 15], [rows, 24, 15, 24, 15],
  ]);
}

const out = process.argv[2] || path.join(__dirname, 'kookaburrow-dashboards.source.ndjson');
fs.writeFileSync(out, objects.map((o) => JSON.stringify(o)).join('\n') + '\n');
console.log(`${objects.length} objects -> ${out}`);
