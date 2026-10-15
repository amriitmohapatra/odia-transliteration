#!/bin/bash
# Build Odia Lens for Mac (owner testing only, not for sharing yet).
#
# Like ime-macos/build.sh: Command Line Tools only, no Xcode project, ad-hoc signed.
#
#   ./build.sh          build mac-lens/build/OdiaLens.app
#   ./build.sh --open   build, then open it
#
# Needs: Node (for the results page, built from lens/src/mac.ts: run `npm install` in
# the repository once) and Homebrew's tesseract (`brew install tesseract`) to read.

set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="OdiaLens"
BUNDLE="build/${APP_NAME}.app"

echo "==> Building the results page (lens/src/mac.ts)"
(cd .. && node lens/build.mjs --mac)

echo "==> Cleaning the app bundle"
rm -rf "${BUNDLE}"
mkdir -p "${BUNDLE}/Contents/MacOS" "${BUNDLE}/Contents/Resources/tessdata"

echo "==> Compiling Swift"
xcrun swiftc \
    -O \
    -swift-version 5 \
    -target "$(uname -m)-apple-macos14.0" \
    -framework Cocoa \
    -framework WebKit \
    -framework ScreenCaptureKit \
    -o "${BUNDLE}/Contents/MacOS/${APP_NAME}" \
    Sources/*.swift

echo "==> Assembling the bundle"
cp Info.plist "${BUNDLE}/Contents/Info.plist"
printf 'APPL????' > "${BUNDLE}/Contents/PkgInfo"
cp -R build/web "${BUNDLE}/Contents/Resources/web"
cp ../lens/vendor/ori.traineddata "${BUNDLE}/Contents/Resources/tessdata/"

echo "==> Ad-hoc code signing"
codesign --force --deep --sign - "${BUNDLE}"

echo "==> Built ${BUNDLE}"
du -sh "${BUNDLE}" | sed 's/^/    /'
if ! command -v tesseract >/dev/null 2>&1 && [ ! -x /opt/homebrew/bin/tesseract ] && [ ! -x /usr/local/bin/tesseract ]; then
    echo ""
    echo "    Note: tesseract is not installed. The lens needs it to read: brew install tesseract"
fi

if [[ "${1:-}" == "--open" ]]; then
    open "${BUNDLE}"
fi
