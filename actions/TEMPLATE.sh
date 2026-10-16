NAME='Short title of the action'
DESCRIPTION='One or two sentences on what this action changes on the host and when to use it.'
DEPENDENCIES=()
PARAMETERS=(EXAMPLE_INPUT)
TAGS=(containment process)

# ----------------------------------------------------------------------------
# ACTION TEMPLATE (bash) - copy to actions/bash/<your-action>.sh
#
# An action is a script that CHANGES the host (kill a process, create a user, block an address...).
# It is written like a hunt (see hunts/TEMPLATE.sh) with one extra metadata variable.
#
# Metadata
#   * NAME, DESCRIPTION, DEPENDENCIES, PARAMETERS and TAGS must be the first statements in the
#     file. Each value is a plain literal; the platform reads them as text and never runs the
#     script to do so. Avoid apostrophes inside single quotes.
#   * DEPENDENCIES: external binaries the action needs. () for none.
#   * PARAMETERS: names of the inputs the action needs, UPPER_SNAKE_CASE, for example
#     (PROCESS_NAME). The platform will define a shell variable of the same name before the
#     script starts, so use it directly. () when the action needs no input. (Entering values and
#     running actions is not wired up yet.)
#   * TAGS: short lowercase labels. Common ones: containment, process, accounts, network,
#     firewall, services, persistence, remediation, filesystem.
#
# Action (everything after the metadata)
#   * Check every parameter first and exit non-zero if it is empty or invalid.
#   * Print what was changed, so the output is the audit record. Always quote "$VARIABLES".
#   * Be as narrow as possible: act on exactly what the parameters name.
#   * Many actions need root; the platform's sudo handling will apply. Keep LF line endings.
# ----------------------------------------------------------------------------
[ -n "$EXAMPLE_INPUT" ] || { echo "EXAMPLE_INPUT is required" >&2; exit 2; }
echo "Would act on: $EXAMPLE_INPUT"
