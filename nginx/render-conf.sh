#!/bin/sh
# Renders nginx/default.conf.template into a concrete nginx config.
#
#   render-conf.sh <template> <output> <slug> [csp-connect-src-extra]
#
# Run by the Dockerfile's build stage, once, so the image ships a finished
# config and nothing is substituted at container start.
#
# The CSP is aihub-bff's build_csp() in its non-dev form
# (bff/app/kernel/observability/security_headers.py), directive for directive
# and in the same order, so a use-case UI and the hub that links to it send the
# same policy:
#
#   csp-connect-src-extra    appended to connect-src, e.g. NaaS's map tile host
#                            (the BFF's CSP_CONNECT_SRC_EXTRA).
#
# There is no object-store origin (the BFF's object_store_origin): this app's
# browser code never reaches GCS directly, so storage.googleapis.com is not in
# connect-src, img-src or media-src.
set -eu

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "usage: $0 <template> <output> <slug> [csp-connect-src-extra]" >&2
  exit 2
fi

template="$1"
output="$2"
slug="$3"
connect_src_extra="${4:-}"

# The slug becomes a URL path segment and nginx location names, so keep it to
# the characters a slug can legitimately have.
case "$slug" in
  "" | -* | *[!a-z0-9-]*)
    echo "ERROR - slug '${slug}' must be lowercase letters, digits and hyphens." >&2
    exit 1
    ;;
esac

# Origins land inside a double-quoted nginx string: refuse anything that could
# end it or start a new directive.
for value in "$connect_src_extra"; do
  case "$value" in
    *[!A-Za-z0-9:/._*\ -]*)
      echo "ERROR - CSP origin list '${value}' contains characters other than [A-Za-z0-9:/._* -]." >&2
      exit 1
      ;;
  esac
done

# Collapse whitespace, as the BFF's .strip() does for the ends.
connect_src_extra="$(printf '%s' "$connect_src_extra" | tr -s ' ' | sed 's/^ //; s/ $//')"

connect_src="'self'"
if [ -n "$connect_src_extra" ]; then
  connect_src="'self' ${connect_src_extra}"
fi
media_src="'self' blob:"
img_src="'self' data: blob:"

csp="default-src 'self'"
csp="${csp}; script-src 'self'"
csp="${csp}; style-src 'self' 'unsafe-inline'"
csp="${csp}; img-src ${img_src}"
csp="${csp}; media-src ${media_src}"
csp="${csp}; font-src 'self' data:"
csp="${csp}; connect-src ${connect_src}"
csp="${csp}; form-action 'self'"
csp="${csp}; frame-ancestors 'self'"
csp="${csp}; base-uri 'self'"
csp="${csp}; object-src 'none'"
csp="${csp}; upgrade-insecure-requests"
csp="${csp}; worker-src 'self' blob:"

sed -e "s|@SLUG@|${slug}|g" -e "s|@CSP@|${csp}|g" "$template" > "$output"

if grep -q '@[A-Z_]*@' "$output"; then
  echo "ERROR - unrendered placeholder left in ${output}:" >&2
  grep -n '@[A-Z_]*@' "$output" >&2
  exit 1
fi

echo "Rendered ${output} for /${slug}"
echo "CSP: ${csp}"
