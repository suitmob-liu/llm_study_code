#!/usr/bin/env bash
# 无 Gradle 构建：aapt2 -> javac -> d8 -> zipalign -> apksigner
# 用法：bash build.sh [mobile|tv|all]   默认 all
#   mobile：原装版，包名 top.suitmob.tv，    产物 out/esj-mobile-v<版本>.apk
#   tv    ：电视版，包名 top.suitmob.tv.box，产物 out/esj-tvbox-v<版本>.apk
#           （遥控鼠标、常亮、电脑版 UA 切换、关于/WebView 版本）
set -euo pipefail
cd "$(dirname "$0")"

SDK=/d/soft/as_android/sdk
BT=$SDK/build-tools/34.0.0
ANDROID_JAR=$SDK/platforms/android-34/android.jar
export JAVA_HOME=/d/soft/as_android/jdk17
export PATH="$JAVA_HOME/bin:$PATH"

KEYSTORE=release.keystore
KS_PASS=suitmob123
ALIAS=suitmob

VERSION=$(grep -o 'android:versionName="[^"]*"' AndroidManifest.xml | cut -d'"' -f2)

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -noprompt -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 36500 \
    -dname "CN=ESJ, O=suitmob, C=CN" </dev/null
fi

build_flavor() {
  local flavor=$1 is_tv package name
  if [ "$flavor" = tv ]; then
    is_tv=true; package=top.suitmob.tv.box; name=esj-tvbox
  else
    is_tv=false; package=top.suitmob.tv; name=esj-mobile
  fi
  local B=build/$flavor
  local OUT=out/$name-v$VERSION.apk
  echo "========== $flavor ($package) =========="
  rm -rf "$B" && mkdir -p "$B/res" "$B/gen/top/suitmob/tv" "$B/classes" "$B/dex" out

  echo "[1/6] 编译资源"
  "$BT/aapt2.exe" compile --dir res -o "$B/res/res.zip"
  local overlay=()
  if [ "$flavor" = tv ]; then
    "$BT/aapt2.exe" compile --dir res-tv -o "$B/res/res-tv.zip"
    overlay=(-R "$B/res/res-tv.zip")
  fi
  "$BT/aapt2.exe" link -o "$B/app-unsigned.apk" -I "$ANDROID_JAR" \
    --manifest AndroidManifest.xml --java "$B/gen" --custom-package top.suitmob.tv \
    --rename-manifest-package "$package" \
    --min-sdk-version 21 --target-sdk-version 34 \
    "$B/res/res.zip" "${overlay[@]}"

  cat > "$B/gen/top/suitmob/tv/Flavor.java" <<EOF
package top.suitmob.tv;

/** 构建时生成，勿手改。 */
public final class Flavor {
    public static final boolean TV = $is_tv;
}
EOF

  echo "[2/6] 编译 Java"
  javac -encoding UTF-8 --release 8 -nowarn -classpath "$ANDROID_JAR" \
    -d "$B/classes" $(find src "$B/gen" -name '*.java') 2>&1 | grep -av "^warning\|^注:\|^Note:" || true
  test -f "$B/classes/top/suitmob/tv/MainActivity.class"

  echo "[3/6] 生成 dex"
  "$BT/d8.bat" --release --min-api 21 --lib "$ANDROID_JAR" --output "$B/dex" \
    $(find "$B/classes" -name '*.class') </dev/null

  echo "[4/6] 打包 dex"
  (cd "$B/dex" && "$BT/aapt.exe" add ../app-unsigned.apk classes.dex >/dev/null)

  echo "[5/6] 对齐"
  "$BT/zipalign.exe" -f -p 4 "$B/app-unsigned.apk" "$B/app-aligned.apk"

  echo "[6/6] 签名"
  "$BT/apksigner.bat" sign --ks "$KEYSTORE" --ks-pass pass:$KS_PASS --ks-key-alias "$ALIAS" \
    --out "$OUT" "$B/app-aligned.apk" </dev/null
  rm -f "$OUT.idsig"
  ls -la "$OUT"
}

case "${1:-all}" in
  mobile) build_flavor mobile ;;
  tv) build_flavor tv ;;
  all) build_flavor mobile; build_flavor tv ;;
  *) echo "用法: bash build.sh [mobile|tv|all]"; exit 1 ;;
esac
