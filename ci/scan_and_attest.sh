#!/usr/bin/env bash
# Scan gate + Binary Authorization attestation (AI CoE security hardening S-3).
#
# For each image: resolve its digest, wait for the Artifact Analysis scan of
# that digest, fail on any CRITICAL or HIGH vulnerability that has a fix
# available (unless listed in ci/vuln-exceptions.txt and not yet expired),
# then sign an attestation for the digest with the aicoe-build-attestor's KMS
# key. Cloud Run services and jobs deployed with --binary-authorization=default
# admit only attested digests, so an image that skipped this gate cannot run.
#
# Usage: ci/scan_and_attest.sh NAME=IMAGE_URI [NAME=IMAGE_URI ...]
# Writes NAME_DIGEST=<image@sha256:...> lines to ${ATTEST_ENV_FILE:-attested.env}
# (a GitLab dotenv report), which the deploy job uses instead of the tag.
#
# Exceptions file format, one per line (comments with #):
#   CVE-2024-12345  2026-12-31  reason why it is accepted
# An expired exception blocks again.
set -euo pipefail

: "${BINAUTHZ_ATTESTOR_PROJECT:=gclt-aicoe-dev-ingress}"
: "${BINAUTHZ_ATTESTOR:=aicoe-build-attestor}"
: "${BINAUTHZ_KEY_VERSION:=projects/gclt-aicoe-dev-ingress/locations/europe-west3/keyRings/ingress-ew3/cryptoKeys/attestor-signing/cryptoKeyVersions/1}"
: "${SCAN_WAIT_SECONDS:=900}"
: "${SCAN_BLOCK_SEVERITIES:=CRITICAL,HIGH}"
: "${VULN_EXCEPTIONS_FILE:=ci/vuln-exceptions.txt}"
OUT="${ATTEST_ENV_FILE:-attested.env}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
: > "$OUT"

[ "$#" -ge 1 ] || { echo "usage: $0 NAME=IMAGE_URI ..."; exit 2; }

gate() {
  # $1 = vulnerability JSON from `describe --show-package-vulnerability`
  python3 - "$1" "$SCAN_BLOCK_SEVERITIES" "$VULN_EXCEPTIONS_FILE" <<'PY'
import datetime, json, os, sys

path, severities, exc_path = sys.argv[1], set(sys.argv[2].split(",")), sys.argv[3]
data = json.load(open(path))
today = datetime.date.today()

exceptions = {}
if os.path.exists(exc_path):
    for line in open(exc_path):
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split(None, 2)
        if len(parts) < 2:
            sys.exit(f"bad exception line (need: CVE-ID YYYY-MM-DD reason): {line}")
        exceptions[parts[0]] = datetime.date.fromisoformat(parts[1])

vulns = (data.get("package_vulnerability_summary") or {}).get("vulnerabilities") or {}
blocking, excepted, counts = [], [], {}
for sev, occs in vulns.items():
    for o in occs:
        v = o.get("vulnerability") or {}
        severity = v.get("effectiveSeverity") or v.get("severity") or sev
        counts[severity] = counts.get(severity, 0) + 1
        if severity not in severities or not v.get("fixAvailable"):
            continue
        cve = (o.get("noteName") or "").rsplit("/", 1)[-1]
        pkgs = sorted({(pi.get("affectedPackage") or pi.get("packageName") or "?")
                       for pi in v.get("packageIssue") or []})
        entry = f"{severity:8} {cve:20} {', '.join(pkgs)}"
        until = exceptions.get(cve)
        if until and until >= today:
            excepted.append(f"{entry}  (accepted until {until})")
        else:
            blocking.append(entry + (f"  (exception EXPIRED {until})" if until else ""))

print("  vulnerabilities by severity:", ", ".join(f"{k}={v}" for k, v in sorted(counts.items())) or "none")
for e in sorted(set(excepted)):
    print("  accepted:", e)
for b in sorted(set(blocking)):
    print("  BLOCKING:", b)
if blocking:
    print(f"  {len(set(blocking))} fixable {'/'.join(sorted(severities))} finding(s): upgrade the base image or "
          f"package, or add a dated entry to {exc_path} with the reason.")
    sys.exit(1)
PY
}

for pair in "$@"; do
  NAME="${pair%%=*}"
  IMAGE="${pair#*=}"
  echo "== ${NAME}: ${IMAGE}"
  DIGEST_URI="$(gcloud artifacts docker images describe "$IMAGE" \
    --format='value(image_summary.fully_qualified_digest)')"
  [ -n "$DIGEST_URI" ] || { echo "ERROR - could not resolve digest for $IMAGE"; exit 1; }
  echo "  digest: ${DIGEST_URI##*@}"

  # Artifact Analysis scans each pushed digest; wait until it has finished.
  deadline=$(( $(date +%s) + SCAN_WAIT_SECONDS ))
  while :; do
    gcloud artifacts docker images describe "$DIGEST_URI" --show-package-vulnerability \
      --format=json > "$WORK/scan.json"
    STATUS="$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); ds=(d.get("discovery_summary") or {}).get("discovery") or [{}]; print((ds[0].get("discovery") or {}).get("analysisStatus",""))' "$WORK/scan.json")"
    case "$STATUS" in
      FINISHED_SUCCESS) break ;;
      FINISHED_FAILED|FINISHED_UNSUPPORTED)
        echo "ERROR - Artifact Analysis status ${STATUS}: the image could not be scanned, so it is not attested"
        exit 1 ;;
    esac
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "ERROR - scan not finished after ${SCAN_WAIT_SECONDS}s (status '${STATUS:-none}')"
      exit 1
    fi
    echo "  waiting for scan (status '${STATUS:-pending}')..."
    sleep 20
  done

  gate "$WORK/scan.json"

  if gcloud container binauthz attestations list \
      --attestor="$BINAUTHZ_ATTESTOR" --attestor-project="$BINAUTHZ_ATTESTOR_PROJECT" \
      --artifact-url="$DIGEST_URI" --format='value(name)' 2>/dev/null | grep -q .; then
    echo "  already attested"
  else
    gcloud beta container binauthz attestations sign-and-create \
      --project="$BINAUTHZ_ATTESTOR_PROJECT" \
      --artifact-url="$DIGEST_URI" \
      --attestor="$BINAUTHZ_ATTESTOR" \
      --attestor-project="$BINAUTHZ_ATTESTOR_PROJECT" \
      --keyversion="$BINAUTHZ_KEY_VERSION" \
      --validate --quiet
    echo "  attested by ${BINAUTHZ_ATTESTOR}"
  fi
  echo "${NAME}_DIGEST=${DIGEST_URI}" >> "$OUT"
done
echo "== wrote $(wc -l < "$OUT") digest(s) to $OUT"
