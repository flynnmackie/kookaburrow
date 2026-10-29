<p align="center"><img src="../public/logo.png" alt="Kookaburrow" width="90"></p>

[Documentation index](../README.md#documentation) · Previous: [The library](09-library.md) · Next: [Security](11-security.md)

# 10. Elastic

Kookaburrow can forward every row a hunt collects to **Elasticsearch**, so hunts can be searched and dashboarded in Kibana, and each user can query their own hunts.

> **Status:** tested against a mock Elasticsearch server and a real single-node Elasticsearch 8 with Kibana (rows sent from a hunt and read in Discover). SOF-ELK is not confirmed. Test against your own cluster with *Test connection* and *Send a past hunt* before relying on it.

- [How it works](#how-it-works)
- [Setting up Elasticsearch on Ubuntu](#setting-up-elasticsearch-on-ubuntu)
- [Setting up Kibana](#setting-up-kibana)
- [Configuring Kookaburrow](#configuring-kookaburrow)
- [Testing it end to end](#testing-it-end-to-end)
- [Creating the Kookaburrow data view](#creating-the-kookaburrow-data-view)
- [Useful searches in Kibana](#useful-searches-in-kibana)
- [Kibana dashboards](#kibana-dashboards)
- [What is sent](#what-is-sent)
- [Reliability](#reliability)
- [SOF-ELK](#sof-elk)
- [Limits](#limits)

## How it works

- Each CSV row of each collection becomes **one document**, sent with the Elasticsearch `_bulk` API **as results arrive** from each host (for hunts set to send).
- No agent, Logstash or extra software is needed: Kookaburrow talks to Elasticsearch directly over HTTP or HTTPS.
- **Hunts only** for now; responses are not forwarded.
- Sending is decided **per hunt**: **Send results to Elastic** on the Automation step of the New Hunt dialog. **Settings > External > Elastic** holds the connection and whether new hunts send **by default** (off until you turn it on).

## Setting up Elasticsearch on Ubuntu

A single node is enough to start. Give the server at least 4 GB of RAM (8 GB is better) and a few GB of disk. Commands are for Ubuntu with the 8.x packages. Run them on the Elasticsearch server.

### 1. Install Elasticsearch

Security and HTTPS are on by default. **The install prints a password for the `elastic` user: copy it.** (It looks like "The generated password for the elastic built-in superuser is ...".)

```bash
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo gpg --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg
sudo apt-get install -y apt-transport-https
echo "deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list
sudo apt-get update && sudo apt-get install -y elasticsearch
```

### 2. Allow other machines to connect, and start it

```bash
echo 'network.host: 0.0.0.0' | sudo tee -a /etc/elasticsearch/elasticsearch.yml
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elastic.conf && sudo sysctl --system
sudo systemctl enable --now elasticsearch
sudo ufw allow 9200/tcp        # only if ufw is active
```

Run each `echo ... | sudo tee -a` line **once**: running it twice writes the setting twice, and a duplicated setting stops the service reading its file.

### 3. Check it from your own computer

Browse to `https://<server>:9200`.

- The browser warns about the certificate. That is expected: Elasticsearch made its own certificate authority. Continue past the warning.
- It asks for a user name and password. That is the correct state (security is on). Use `elastic` and the password from the install.
- After signing in you see a small JSON page with the cluster name and version. Elasticsearch is working.

If you lost the password, make a new one on the server (`-i` lets you choose it):

```bash
sudo /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic
```

### 4. Make a limited API key for Kookaburrow

Kookaburrow should not use the `elastic` account. This key can only write to `kookaburrow-*` indexes (and, with `manage_index_templates`, install the [index template](#1-install-the-index-template-once) for the dashboards):

```bash
curl --cacert /etc/elasticsearch/certs/http_ca.crt -u elastic -X POST https://localhost:9200/_security/api_key \
  -H 'Content-Type: application/json' -d '{"name":"kookaburrow","role_descriptors":{"kb":{"cluster":["monitor","manage_index_templates"],"indices":[{"names":["kookaburrow-*"],"privileges":["create_index","index","auto_configure"]}]}}}'
```

It asks for the `elastic` password. Copy the long `encoded` value from the answer. Then copy the certificate authority text Kookaburrow will need to trust:

```bash
sudo cat /etc/elasticsearch/certs/http_ca.crt
```

(Copy from `-----BEGIN CERTIFICATE-----` to `-----END CERTIFICATE-----`.) With Kibana installed you can make the key in **Dev Tools** instead: `POST /_security/api_key` with the same body.

### 5. Check what arrived, from the server

After Kookaburrow has sent a hunt ([Testing it end to end](#testing-it-end-to-end)):

```bash
curl --cacert /etc/elasticsearch/certs/http_ca.crt -u 'elastic:YOUR_PASSWORD' "https://localhost:9200/_cat/indices/kookaburrow-*?v"
curl --cacert /etc/elasticsearch/certs/http_ca.crt -u 'elastic:YOUR_PASSWORD' "https://localhost:9200/kookaburrow-*/_search?q=kookaburrow.run_by:admin&size=1&pretty"
```

- Put the password in **single quotes** so special characters survive. If you type it at the prompt and get `unable to authenticate user [elastic]`, the password was mistyped (nothing shows as you type); try the quoted form or reset it.
- Do not use Kookaburrow's API key here. It is deliberately limited to writing, so it cannot list indexes.
- You want an index named like `kookaburrow-accounts-local-users` with a document count above zero.

## Setting up Kibana

Kibana is how you browse the data. Install it on the same server.

```bash
sudo apt-get install -y kibana
echo 'server.host: "0.0.0.0"' | sudo tee -a /etc/kibana/kibana.yml
sudo ufw allow 5601/tcp        # only if ufw is active
```

Then connect it to Elasticsearch with an enrollment token (valid about 30 minutes; make a new one if it expires). The **command-line way is the most reliable**:

```bash
sudo /usr/share/elasticsearch/bin/elasticsearch-create-enrollment-token -s kibana
sudo /usr/share/kibana/bin/kibana-setup --enrollment-token <paste the token>
sudo systemctl enable --now kibana
```

Browse to `http://<server>:5601` (it takes a minute or two to start) and sign in as `elastic`.

The browser way also works: start Kibana, open `http://<server>:5601`, paste the token, and enter the code printed by `sudo /usr/share/kibana/bin/kibana-verification-code`.

### If Kibana will not set up or start

| Symptom | Cause and fix |
|---|---|
| The browser setup says it *couldn't write to the config file* | Kibana's account cannot write `/etc/kibana/kibana.yml`. Run `sudo chown -R root:kibana /etc/kibana && sudo chmod 660 /etc/kibana/kibana.yml`, then retry, or use the command-line enrollment above, which does not need it |
| *Refused to connect* on port 5601 | Nothing is listening. Check `sudo systemctl status kibana --no-pager`, `sudo journalctl -u kibana -n 40 --no-pager` and `sudo ss -tlnp \| grep 5601`. It may still be starting (wait a minute or two) |
| The service is `failed` and the journal shows a YAML error (`parseDocument`, `readYaml`) | `/etc/kibana/kibana.yml` has a setting defined twice. Find it with `sudo awk -F: '/^[A-Za-z]/{print $1}' /etc/kibana/kibana.yml \| sort \| uniq -d`. For `server.host`: `sudo sed -i '/^server\.host:/d' /etc/kibana/kibana.yml` then add the line once. Remove duplicates of `elasticsearch.*` lines by editing the file (`sudo nano /etc/kibana/kibana.yml`) |
| *Start request repeated too quickly* | systemd stops retrying after several failures. After fixing the cause: `sudo systemctl reset-failed kibana && sudo systemctl start kibana`, and watch `sudo journalctl -u kibana -f` for "http server running" |
| Listening only on `127.0.0.1:5601` | `server.host: "0.0.0.0"` is missing or not read. Fix the file and restart |
| Listening on `0.0.0.0:5601` but the browser cannot connect | A firewall: `sudo ufw allow 5601/tcp` |
| The enrollment token was rejected | It expired or was already used. Make a new one |

Make a backup before editing: `sudo cp /etc/kibana/kibana.yml /root/kibana.yml.bak`.

## Configuring Kookaburrow

**Settings > External > Elastic**:

| Field | Meaning |
|---|---|
| Send hunts by default | On: New Hunt starts with *Send results to Elastic* on. Off: it starts off. Each hunt can change it. Needs an address to be set |
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

**Send a past hunt** queues every row of a finished hunt (choose it from the list). Use it to test, to backfill hunts that did not send, and to resend after a failure.

The status line shows rows sent and failed since the server started, rows waiting, the time of the last send and the last error. Each hunt also records how many rows were sent and failed.

Changing these settings needs `system.manage`; viewing needs `system.view`.

## Testing it end to end

1. **Configure** Kookaburrow as above and press **Test connection**. You want "Connected to Elasticsearch 8.x" and "This account can create indexes and write documents". Press **Save**.
2. **Run a small hunt** on one host, for example *Accounts - Local Users* and *Network - Listening Ports*. On the **Automation** tab of the New Hunt dialog turn on **Send results to Elastic**.
3. When it finishes, open the hunt (**Burrow! > Hunt**, select it, **Details**). The **Elastic** line shows rows sent and none failed. The Elastic settings page shows the totals.
4. **Check on the server** with the `curl` commands in [step 5](#5-check-what-arrived-from-the-server): an index per collection, with a document count.
5. **Look at it in Kibana**: [create the data view](#creating-the-kookaburrow-data-view) and open Discover.

Things worth trying:

- **Send again.** *Send a past hunt* on the Elastic page replaces the same documents (their IDs are fixed), so nothing is duplicated.
- **Sending off.** A hunt with the switch off sends nothing.
- **Elasticsearch down.** Stop Elasticsearch, send a hunt, then start it again. Batches are retried (see [Reliability](#reliability)) and the status line shows any error.
- **A workflow.** Send a workflow's output (Hayabusa, EvtxECmd, Chainsaw): the documents carry `kookaburrow.workflow` and `kookaburrow.processor`.

## Creating the Kookaburrow data view

A data view tells Kibana which indexes to read. Make one once.

1. Open the menu (top left) and choose **Discover**. On a fresh install it offers **Create data view**. Otherwise go to **Stack Management > Data Views > Create data view**.
2. **Name:** `Kookaburrow`.
3. **Index pattern:** `kookaburrow-*`. The box lists the matching indexes (for example `kookaburrow-accounts-local-users`). If nothing matches, no rows have been sent yet.
4. **Timestamp field:** `@timestamp`.
5. Press **Save data view to Kibana**.

Then in **Discover** choose the **Kookaburrow** data view and set the **time range** (top right) to cover when the hunt ran, for example *Last 24 hours*. Rows are stamped with the time they were collected, so a hunt outside the range shows *No results*. Hover a field in the left list and press **+** to add it as a column: `host.name`, `kookaburrow.collection` and the `kookaburrow.data.*` fields.

## Useful searches in Kibana

Type these into the search bar in Discover (KQL):

| To see | Search |
|---|---|
| Only your own hunts | `kookaburrow.run_by : "admin"` |
| One hunt | `kookaburrow.hunt : "Weekly persistence sweep"` |
| One collection | `kookaburrow.collection : "Accounts - Local Users"` |
| One collection, by index name | `event.dataset : "kookaburrow.accounts-local-users"` |
| One host | `host.name : "WIN1"` |
| Runs started by a recurring schedule | `kookaburrow.scheduled : true` |
| What a workflow produced | `kookaburrow.workflow : "Event Logs - Hayabusa Timeline"` |
| One processor's output | `kookaburrow.processor : "evtxecmd"` |
| A value inside the data | `kookaburrow.data.Name : "Updater"` |

Combine them with `and` / `or`, for example `kookaburrow.run_by : "admin" and host.name : "WIN1"`.

Tips:

- **Filter on `kookaburrow.collection` first.** Each collection is its own index, so the `kookaburrow.data.*` columns differ between collections.
- **Values are text.** Everything under `kookaburrow.data` is stored as text, so numbers and dates in the data are not searchable as numbers or dates; search for exact values (or with wildcards, for example `kookaburrow.data.Path : *Temp*`).
- **Count per collection.** In **Visualize** make a bar chart and split by terms on `kookaburrow.collection`; do the same on `host.name` for rows per host.
- **Save searches** (the **Save** button in Discover) and build dashboards from them.

### Who sees what

`run_by` is a filter, not access control: anyone who can open the data view sees every user's rows. To restrict each user to their own rows, give them an Elastic role with **document-level security** (a query on `kookaburrow.run_by`) and, if you want, their own Kibana space.

## Kibana dashboards

Kookaburrow ships five dashboards for Kibana 8 (tested on Elasticsearch and Kibana 8.19.23: all five import and draw with real hunt data) and can import them for you. They read the same `kookaburrow-*` indexes as Discover.

| Dashboard | What it shows |
|---|---|
| **Overview** | Hunts, rows, hosts and collections; rows over time by collection; rows by collection, host and user; recent hunts; the latest rows |
| **Users** | Hunts, rows and last activity per user (`kookaburrow.run_by`); manual and scheduled hunts; rows per user and collection |
| **Workflow results** | Rows per processor and workflow; Hayabusa detections by level, rule, host and over time; EvtxECmd top event IDs and channels; Chainsaw and Zircolite detections |
| **Hosts** | Rows, hunts, collections and last row per host; rows over time by host; which collections ran on which host |
| **Recurring hunts** | Scheduled hunts: runs, rows, hosts and last run; runs and rows over time |

They open on the last 30 days. Set the time range (top right) to cover your hunts.

### 1. Install the index template (once)

Without a template Elasticsearch guesses every field as text, which cannot be charted directly. The template maps the fields every Kookaburrow document has (`@timestamp`, `host.name`, `host.ip`, `kookaburrow.run_by`, `kookaburrow.collection`, `kookaburrow.hunt`, `kookaburrow.scheduled`, `kookaburrow.workflow`, `kookaburrow.processor` and a few more). The `kookaburrow.data.*` columns stay text with a `.keyword` copy for charts, because every collection has different columns. The template also switches off date and number detection, so a column whose values look like dates in one hunt and not in another cannot become a date in one index and text in another (Kibana shows that as a *type conflict*).

In **Settings > External > Elastic**, under **Index template**, press **Install index template**. It uses the API key saved above, which needs one more cluster privilege, `manage_index_templates` (see below). **Show the request** displays the exact request, which you can paste into Kibana **Dev Tools** instead if you would rather not widen the key.

- **Install it before the first hunt is sent.** A template only applies to indexes created after it exists. Indexes that were created earlier keep their guessed mapping and the dashboards cannot chart them (Kibana shows fields as *conflicting* or *not aggregatable*). On the Elasticsearch server delete them and send the hunts again (**Send a past hunt** replaces the same documents):
  ```bash
  curl --cacert /etc/elasticsearch/certs/http_ca.crt -u 'elastic:YOUR_PASSWORD' -X DELETE "https://localhost:9200/kookaburrow-*"
  ```
  (This deletes everything Kookaburrow has sent. Only do it if you can send the hunts again.)
- **A key made earlier:** add the privilege by making a new key with the cluster list `["monitor","manage_index_templates"]` in the command in [step 4](#4-make-a-limited-api-key-for-kookaburrow), and save it in Kookaburrow. **Test connection** reports whether the key can install the template.
- If you change the **Index prefix**, install the template again so it covers the new prefix.

### 2. Import the dashboards

Press **Import dashboards...** (same page) and fill in:

| Field | Meaning |
|---|---|
| Kibana address | For example `http://kibana.lab.local:5601`. Remembered for next time; it is not a secret |
| Sign-in | **User name and password** (the `elastic` user works), an **API key**, or **None** when Kibana has no security. **The sign-in is used for this one import and is not saved** |
| Space | Leave blank for the default space, or give a Kibana space id |
| Skip certificate check | Only for https with a self-signed certificate. The CA pasted in the Elasticsearch settings above is used when there is one |

Press **Import**. The result says how many objects were imported (the data view, a saved search, the visualizations and the dashboards) and gives a link to the dashboards in Kibana.

- **Importing again replaces** the shipped objects (they have fixed IDs). To change one, make a copy in Kibana first (**Save as new**), or your change is overwritten the next time.
- The imported **data view follows your index prefix** (`<prefix>-*`).
- **An API key for the import** must be allowed to use Kibana: make it in **Stack Management > API keys** with Kibana privileges (Dashboard, Visualize, Discover, Data Views and Saved Objects Management). The Elasticsearch key from step 4 cannot import into Kibana.
- You can also import by hand: the file is `elastic/kibana/kookaburrow-dashboards.ndjson`; in Kibana go to **Stack Management > Saved Objects > Import** and choose it (overwrite when asked). With a custom index prefix, edit the data view's pattern afterwards.

### If something does not work

| Symptom | Cause and fix |
|---|---|
| Install index template says the account is *not allowed* | The API key lacks `manage_index_templates`. Make a key with it, or paste **Show the request** into Kibana Dev Tools |
| Import says *refused the sign-in* | Wrong user or password, or an API key that is an Elasticsearch key rather than a Kibana-capable one |
| Import says *not allowed to import* | The account lacks Kibana privileges (Dashboard, Visualize, Discover, Data Views, Saved Objects Management). Use `elastic`, or make a role |
| Import says *Kibana was not found* | Check the address and port (usually 5601), the space id, and any base path |
| Import says the certificate is not trusted | https with an internal CA: paste the CA in the Elasticsearch settings above, or tick *Skip certificate check* |
| Panels say *no results* | Widen the time range; check that hunts were sent with **Send results to Elastic** on |
| Panels show errors such as *field is not aggregatable* | Those indexes were created before the template. Delete them and send the hunts again (see step 1) |
| Workflow panels are empty | They only fill once a hunt with a workflow attached has been sent (Hayabusa, EvtxECmd, Chainsaw, Zircolite). Rows of other processors do not appear in these panels |

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

### Workflow output

When a hunt that has a [workflow](07-workflows-and-recurring.md) attached is set to send to Elastic, the processor's output is sent the same way. Those documents also carry `kookaburrow.workflow` and `kookaburrow.processor`, go to an index named after the processor (for example `kookaburrow-hayabusa-event-log-timeline`), and use the tool's own time column as `@timestamp` when the processor names one (Hayabusa: `Timestamp`). The CSV columns are under `kookaburrow.data.*`.

## Reliability

- Rows are queued in memory and sent in batches of up to 500 documents or 5 MB.
- A failed batch is **retried up to four times** with a growing delay for network errors, HTTP 429 and HTTP 5xx. A sign-in or privilege error (401 or 403) is not retried.
- Rows Elasticsearch rejects individually are counted as failed with the first reason shown.
- The queue holds up to 500,000 documents; beyond that rows are dropped and the status line says so.
- The queue is **in memory**: a server restart drops anything not yet sent. Use *Send a past hunt* to recover; resending is safe.

## SOF-ELK

SOF-ELK contains Elasticsearch, so the direct method above works against it by pointing Kookaburrow at SOF-ELK's Elasticsearch port (9200), provided that port is reachable from the Kookaburrow server. The rows go into separate `kookaburrow-*` indexes; SOF-ELK's own parsers and dashboards do not apply to them, so build a Kibana data view over `kookaburrow-*`. SOF-ELK's usual file-drop ingest (files placed in its Logstash input directories) is not implemented.

## Limits

- Hunts and workflow output only; responses are not forwarded.
- Row data is text; no field type mapping or ECS mapping of the CSV columns.
- The send queue is not persistent.
- The choice is per hunt, not per collection.
- Tested against a mock server and one real single-node Elasticsearch 8 with Kibana; SOF-ELK behaviour is yet to be confirmed.
