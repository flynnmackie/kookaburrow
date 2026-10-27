<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [The library](09-library.md) · Next: [Security](11-security.md)

# 10. Elastic

Kookaburrow can forward every row a hunt collects to **Elasticsearch**, so hunts can be searched and dashboarded in Kibana, and each user can query their own hunts.

> **Status:** tested against a mock Elasticsearch server. Test against your own cluster with *Test connection* and *Send a past hunt* before relying on it.

- [How it works](#how-it-works)
- [Setting up Elasticsearch on Ubuntu](#setting-up-elasticsearch-on-ubuntu)
- [Configuring Kookaburrow](#configuring-kookaburrow)
- [What is sent](#what-is-sent)
- [Reliability](#reliability)
- [Using the data in Kibana](#using-the-data-in-kibana)
- [SOF-ELK](#sof-elk)
- [Limits](#limits)

## How it works

- Each CSV row of each collection becomes **one document**, sent with the Elasticsearch `_bulk` API **as results arrive** from each host (when forwarding is on).
- No agent, Logstash or extra software is needed: Kookaburrow talks to Elasticsearch directly over HTTP or HTTPS.
- **Hunts only** for now; responses are not forwarded.
- Forwarding is **off by default**. Turn it on in **Settings > System > Elastic**.

## Setting up Elasticsearch on Ubuntu

A single node is enough to start. Commands are for Ubuntu with the 8.x packages.

**Install Elasticsearch** (security and HTTPS are on by default; the install prints the `elastic` password, copy it):

```bash
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo gpg --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg
sudo apt-get install -y apt-transport-https
echo "deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list
sudo apt-get update && sudo apt-get install -y elasticsearch
```

**Allow other machines to connect:**

```bash
echo 'network.host: 0.0.0.0' | sudo tee -a /etc/elasticsearch/elasticsearch.yml
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elastic.conf && sudo sysctl --system
sudo systemctl enable --now elasticsearch
curl --cacert /etc/elasticsearch/certs/http_ca.crt -u elastic https://localhost:9200
```

**Install Kibana:**

```bash
sudo apt-get install -y kibana
echo 'server.host: "0.0.0.0"' | sudo tee -a /etc/kibana/kibana.yml
sudo /usr/share/elasticsearch/bin/elasticsearch-create-enrollment-token -s kibana
sudo systemctl enable --now kibana
sudo /usr/share/kibana/bin/kibana-verification-code
```

Browse to `http://<server>:5601`, paste the token and code, and sign in as `elastic`. If `ufw` is active: `sudo ufw allow 9200,5601/tcp`.

**Make a limited API key for Kookaburrow** (Kibana > Dev Tools):

```
POST /_security/api_key
{ "name": "kookaburrow",
  "role_descriptors": { "kb": {
    "cluster": ["monitor"],
    "indices": [{ "names": ["kookaburrow-*"], "privileges": ["create_index","index","auto_configure"] }] } } }
```

Copy the `encoded` value from the response.

## Configuring Kookaburrow

**Settings > System > Elastic**:

| Field | Meaning |
|---|---|
| Forwarding switch | On: new hunt results are sent as they arrive. Off: nothing is sent unless you use *Send a past hunt* |
| Elasticsearch address | `https://host:9200`. Without a scheme `http://` is assumed |
| Sign-in | **None** (security off), **API key**, or **User name and password** |
| API key | The `encoded` value, or `id:key`. Stored **encrypted**; never shown again (the field says *saved: type to replace*) |
| User name / Password | For basic authentication. The password is stored encrypted |
| Index prefix | Default `kookaburrow`. Lowercase letters, digits, `.`, `_`, `-`, starting with a letter or digit |
| Skip certificate check | Accept any certificate (self-signed). Not recommended |
| CA certificate | Paste the PEM of the CA to trust instead, for example `/etc/elasticsearch/certs/http_ca.crt` |

**Test connection** checks, using what is currently in the form (a blank secret falls back to the saved one):

1. It can reach the server and sign in, and shows the Elasticsearch version and cluster name.
2. The account can create indexes and write to `<prefix>-*` (privilege check), or that security is off.

Messages say plainly what is wrong: connection refused, host not found, timed out, certificate not trusted, the server is not speaking TLS on that port, sign-in refused, or which privileges are missing.

**Send a past hunt** queues every row of a finished hunt (choose it from the list). Use it to test, to backfill hunts from before forwarding was on, and to resend after a failure.

The status line shows rows sent and failed since the server started, rows waiting, the time of the last send and the last error. Each hunt also records how many rows were sent and failed.

Changing these settings needs `system.manage`; viewing needs `system.view`.

## What is sent

**Index:** `<prefix>-<collection>`, one index per collection (for example `kookaburrow-persistence-run-keys`). Separate indexes keep different collections' columns apart.

**Document ID:** a hash of the run, collection, host and row number, so sending a run again **replaces** its documents instead of duplicating them.

**Document:**

```json
{
  "@timestamp": "2026-10-27T03:12:44.201Z",
  "event": { "module": "kookaburrow", "dataset": "kookaburrow.persistence-run-keys", "kind": "event" },
  "host": { "name": "WS-014", "ip": ["10.10.20.31"] },
  "kookaburrow": {
    "run_id": "9f1c0a77d2b4e611",
    "hunt": "Weekly persistence sweep",
    "run_by": "alice",
    "scheduled": true,
    "collection": "Persistence - Run Keys",
    "collection_id": "powershell/persistence-run-keys.ps1",
    "data": { "Name": "Updater", "Path": "C:\\Users\\Public\\u.exe", "Hive": "HKCU" }
  }
}
```

| Field | Meaning |
|---|---|
| `@timestamp` | When the row was collected |
| `host.name`, `host.ip` | The target |
| `event.dataset` | `kookaburrow.<collection>` |
| `kookaburrow.run_by` | The user who started the hunt (for a recurring hunt, the user who created the schedule); `unknown` for old runs |
| `kookaburrow.scheduled` | `true` for runs started by a recurring schedule |
| `kookaburrow.run_id`, `hunt` | Which run |
| `kookaburrow.collection`, `collection_id` | Which collection |
| `kookaburrow.data.*` | The CSV columns, **as text**. Dots and spaces in column names become `_`; duplicate names get a trailing `_`; empty cells are left out |

Values are text so mappings cannot clash between hosts. Dates in the data are not parsed into date fields.

## Reliability

- Rows are queued in memory and sent in batches of up to 500 documents or 5 MB.
- A failed batch is **retried up to four times** with a growing delay for network errors, HTTP 429 and HTTP 5xx. A sign-in or privilege error (401 or 403) is not retried.
- Rows Elasticsearch rejects individually are counted as failed with the first reason shown.
- The queue holds up to 500,000 documents; beyond that rows are dropped and the status line says so.
- The queue is **in memory**: a server restart drops anything not yet sent. Use *Send a past hunt* to recover; resending is safe.
- Turning forwarding off clears what is waiting.

## Using the data in Kibana

1. **Stack Management > Data Views > Create**, pattern `kookaburrow-*`, time field `@timestamp`.
2. **Discover** and filter:
   - your own hunts: `kookaburrow.run_by : "alice"`
   - one hunt: `kookaburrow.hunt : "Weekly persistence sweep"`
   - one collection: `event.dataset : "kookaburrow.persistence-run-keys"`
   - one host: `host.name : "WS-014"`
   - only scheduled runs: `kookaburrow.scheduled : true`
3. Save searches and build dashboards on `kookaburrow.data.*` fields.

`run_by` is a filter, not access control: anyone who can open the data view sees every user's rows. To restrict each user to their own rows, give them an Elastic role with **document-level security** (a query on `kookaburrow.run_by`) and, if you want, their own Kibana space.

## SOF-ELK

SOF-ELK contains Elasticsearch, so the direct method above works against it by pointing Kookaburrow at SOF-ELK's Elasticsearch port (9200), provided that port is reachable from the Kookaburrow server. The rows go into separate `kookaburrow-*` indexes; SOF-ELK's own parsers and dashboards do not apply to them, so build a Kibana data view over `kookaburrow-*`. SOF-ELK's usual file-drop ingest (files placed in its Logstash input directories) is not implemented.

## Limits

- Hunts only; responses are not forwarded.
- Row data is text; no field type mapping or ECS mapping of the CSV columns.
- The send queue is not persistent.
- Forwarding is global (not per hunt or collection).
- Tested against a mock server; real Elasticsearch and SOF-ELK behaviour is yet to be confirmed.
