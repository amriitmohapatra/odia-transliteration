#!/bin/bash
# Build the Odia Phonetic input method into a .app bundle.
#
# Deliberately does NOT use an Xcode project. Command Line Tools alone are enough,
# the whole build is ~30 readable lines, and there is no .pbxproj to review.
#
#   ./build.sh            build only
#   ./build.sh --install  build, then install to ~/Library/Input Methods/
#
# Installing needs no admin rights, but macOS only picks up a new input method after
# you log out and back in.

set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="OdiaPhonetic"
BUNDLE="build/${APP_NAME}.app"
INSTALL_DIR="${HOME}/Library/Input Methods"

echo "==> Cleaning"
rm -rf build
mkdir -p "${BUNDLE}/Contents/MacOS" "${BUNDLE}/Contents/Resources"

echo "==> Compiling Swift"
xcrun swiftc \
    -O \
    -target arm64-apple-macos13.0 \
    -framework Cocoa \
    -framework InputMethodKit \
    -o "${BUNDLE}/Contents/MacOS/${APP_NAME}" \
    Sources/main.swift \
    Sources/OdiaInputController.swift

echo "==> Assembling bundle"
cp Info.plist "${BUNDLE}/Contents/Info.plist"
printf 'APPL????' > "${BUNDLE}/Contents/PkgInfo"

echo "==> Ad-hoc code signing"
# "-" is an ad-hoc signature: no Apple Developer Program membership needed.
# Spike S4 exists to find out whether macOS 26 accepts this for an input method,
# or whether it demands a real Developer ID signature and notarization.
codesign --force --deep --sign - "${BUNDLE}"
codesign --verify --verbose=2 "${BUNDLE}" 2>&1 | sed 's/^/    /'

echo "==> Built ${BUNDLE}"
du -sh "${BUNDLE}" | sed 's/^/    /'

if [[ "${1:-}" == "--install" ]]; then
    echo "==> Installing to ${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}"
    rm -rf "${INSTALL_DIR}/${APP_NAME}.app"
    cp -R "${BUNDLE}" "${INSTALL_DIR}/"
    echo ""
    echo "    Installed. Now:"
    echo "      1. Log out and back in (macOS only scans for input methods at login)"
    echo "      2. System Settings > Keyboard > Text Input > Input Sources > Edit > +"
    echo "      3. Choose Odia > 'Odia Phonetic'"
    echo "      4. Switch to it (Ctrl+Space) and type: odia<space>"
    echo "         Expect: ଓଡ଼ିଆ"
    echo ""
    echo "    To uninstall:  rm -rf '${INSTALL_DIR}/${APP_NAME}.app'"
fi
