NAME='Short title of the collection'
DESCRIPTION='One or two sentences on what this collection looks for and why it matters.'
DEPENDENCIES=()
TAGS=(persistence cron)

# ----------------------------------------------------------------------------
# COLLECTION TEMPLATE (bash) - copy to collections/bash/<your-collection>.sh
#
# Metadata (the three variables above)
#   * NAME, DESCRIPTION, DEPENDENCIES and TAGS must be the first statements in the file (after an
#     optional shebang). Comments and blank lines may sit between them; the first other
#     line starts the collection.
#   * Each value must be a plain literal. The platform reads them as text and never runs
#     the script to do so, so $variables and $(commands) are not expanded.
#   * Prefer single quotes and avoid apostrophes inside them (use double quotes if needed).
#   * DEPENDENCIES lists external binaries the collection needs that are NOT part of a standard
#     Linux install, for example (osqueryi chkrootkit rkhunter). Core tools such as ss, find,
#     who and bash do not count. Use () when there are none.
#   * TAGS are short lowercase labels used to filter collections in the UI, for example
#     (persistence cron). Reuse existing tags where you can. Common ones: persistence,
#     execution, defense-evasion, lateral-movement, privilege-escalation, discovery, accounts,
#     logons, network, c2, event-logs, filesystem, malware, inventory, forensics. Use () for none.
#
# Collection (everything after the metadata)
#   * Piped to bash over SSH, so it must not read from stdin.
#   * Write results to stdout; send expected errors to /dev/null or 2>&1.
#   * Collections should be read-only: do not change, install or delete anything on the target.
#   * Keep LF line endings (enforced for *.sh by .gitattributes).
# ----------------------------------------------------------------------------

echo '== Section title =='
ps -eo pid,ppid,user,comm,args --sort=pid
