#!/bin/bash
# Builds faelyx-ui as a static site (dist/) using the real macOS toolchain
# already installed here — the cloud sandbox and the desktop app's own Linux
# VM both got their npm registry access blocked, and neither has a matching
# native build of Vite's bundler, so this has to run in your own Terminal,
# same as run_test.command did for the backend earlier.
cd "$(dirname "$0")"
echo "Building in: $(pwd)"
# publish:docs builds and syncs dist/ into the repo's docs/ folder,
# keeping docs/reference/ (the CATIA guide Markdown) in place.
npm run publish:docs > build_for_pages_log.txt 2>&1
STATUS=$?
echo "Build exit code: $STATUS" >> build_for_pages_log.txt
if [ -d dist ]; then
  echo "dist/ contents:" >> build_for_pages_log.txt
  find dist -type f >> build_for_pages_log.txt
fi
cat build_for_pages_log.txt
echo ""
echo "DONE_MARKER"
