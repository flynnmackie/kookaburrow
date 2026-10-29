# Kibana dashboards for Kookaburrow

`kookaburrow-dashboards.ndjson` holds Kookaburrow's Kibana saved objects: a data view (`kookaburrow-*`), one saved search, 33 visualizations and 5 dashboards. Import it from **Settings > External > Elastic > Import dashboards** in Kookaburrow, or by hand in Kibana (**Stack Management > Saved Objects > Import**). See [the Elastic guide](../../docs/10-elastic.md#kibana-dashboards).

The objects are written by `build.js` (plain aggregation-based visualizations, which every Kibana 8 reads):

```
node elastic/kibana/build.js elastic/kibana/kookaburrow-dashboards.ndjson
```

- Fields: the ones every Kookaburrow document has (mapped by the index template in `src/elastic.js`), plus `kookaburrow.data.<Column>.keyword` for workflow output (Hayabusa `Level` and `RuleTitle`, EvtxECmd `EventId`, `Provider` and `Channel`, Chainsaw `detections`).
- IDs are fixed (`kookaburrow-dashboard-*`, `kookaburrow-vis-*`), so importing again replaces them.
- The data view's pattern is rewritten to the installation's index prefix when Kookaburrow imports.
- The shipped file is `build.js`'s output imported into a real Kibana 8.19.23 and exported again, so every object carries Kibana's own migration versions (volatile fields such as timestamps and the data view's field list are removed, and the data view allows no matching index yet). All five dashboards were opened in that Kibana against real hunt data and sample hunts: every panel drew, with no errors and no type conflicts.
- To regenerate: run `build.js`, import the result into a Kibana of the version to target, export the dashboards with related objects, and clean the export the same way.
