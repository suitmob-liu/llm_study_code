package top.suitmob.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {

    private static final String DEFAULT_URL = "https://tv.suitmob.top";
    private static final String PREFS = "config";
    private static final String KEY_URL = "base_url";
    private static final String KEY_CURSOR = "tv_cursor";
    private static final String KEY_DESKTOP = "tv_desktop_ua";
    private static final String DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            + "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private TvCursor cursor;
    private String defaultUserAgent;

    private SharedPreferences prefs;
    private FrameLayout root;
    private FrameLayout fullscreenContainer;
    private WebView webView;

    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private int originalOrientation;

    private AlertDialog activeDialog;
    private boolean clearHistoryOnFinish;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        root.addView(webView, matchParent());

        fullscreenContainer = new FrameLayout(this);
        fullscreenContainer.setBackgroundColor(Color.BLACK);
        fullscreenContainer.setVisibility(View.GONE);
        root.addView(fullscreenContainer, matchParent());

        if (Flavor.TV) {
            cursor = new TvCursor(this, webView,
                    () -> customView != null ? fullscreenContainer : webView);
            cursor.setCursorEnabled(prefs.getBoolean(KEY_CURSOR, true));
            root.addView(cursor, matchParent());
            // 电视上网页自己实现的"伪全屏"不会触发 onShowCustomView，干脆全程常亮
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        setContentView(root);
        setupWebView();

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(getBaseUrl());
        }
    }

    private static FrameLayout.LayoutParams matchParent() {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        defaultUserAgent = s.getUserAgentString();
        if (Flavor.TV) applyUserAgent();

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (clearHistoryOnFinish) {
                    clearHistoryOnFinish = false;
                    view.clearHistory();
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (Build.VERSION.SDK_INT >= 23 && request.isForMainFrame()) {
                    showLoadError(String.valueOf(error.getDescription()));
                }
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (Build.VERSION.SDK_INT < 23) {
                    showLoadError(description);
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                enterFullscreen(view, callback);
            }

            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }

            @Override
            public Bitmap getDefaultVideoPoster() {
                // 避免部分机型视频封面显示灰色播放图标
                return Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
            }
        });
    }

    /** http/https 在应用内打开，其它协议（intent://、第三方 app 等）交给系统。 */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null || "http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
            return false;
        }
        try {
            Intent intent = "intent".equalsIgnoreCase(scheme)
                    ? Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
                    : new Intent(Intent.ACTION_VIEW, uri);
            startActivity(intent);
        } catch (Exception ignored) {
            // 没有能处理的应用就忽略
        }
        return true;
    }

    // ---------------- 全屏视频 ----------------

    private void enterFullscreen(View view, WebChromeClient.CustomViewCallback callback) {
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        customView = view;
        customViewCallback = callback;
        originalOrientation = getRequestedOrientation();

        fullscreenContainer.addView(view, matchParent());
        fullscreenContainer.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyImmersive(true);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void exitFullscreen() {
        if (customView == null) return;
        fullscreenContainer.removeView(customView);
        fullscreenContainer.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        customView = null;
        if (customViewCallback != null) {
            customViewCallback.onCustomViewHidden();
            customViewCallback = null;
        }
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        applyImmersive(false);
        setRequestedOrientation(originalOrientation);
    }

    @SuppressWarnings("deprecation")
    private void applyImmersive(boolean on) {
        View decor = getWindow().getDecorView();
        if (on) {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        } else {
            decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        }
    }

    // ---------------- 域名配置 ----------------

    private String getBaseUrl() {
        return prefs.getString(KEY_URL, DEFAULT_URL);
    }

    /** 用户可以只输入域名（tv.xxx.top），也可以输入完整地址（http://1.2.3.4:8080/path）。 */
    private static String normalizeUrl(String input) {
        if (input == null) return null;
        String s = input.trim();
        if (s.isEmpty()) return null;
        if (!s.contains("://")) s = "https://" + s;
        Uri uri = Uri.parse(s);
        String scheme = uri.getScheme();
        if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) return null;
        if ("/".equals(uri.getPath()) && s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    private void applyBaseUrl(String url) {
        prefs.edit().putString(KEY_URL, url).apply();
        clearHistoryOnFinish = true;
        webView.stopLoading();
        webView.loadUrl(url);
        Toast.makeText(this, "已切换到 " + url, Toast.LENGTH_SHORT).show();
    }

    private void showDomainDialog() {
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(pad, pad / 2, pad, 0);

        TextView tip = new TextView(this);
        tip.setText("当前地址：" + getBaseUrl() + "\n\n输入新域名（如 tv.example.com）或完整地址（http://ip:端口）：");
        box.addView(tip);

        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_DONE);
        input.setText(getBaseUrl());
        input.setSelectAllOnFocus(true);
        box.addView(input);

        final AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("修改域名")
                .setView(box)
                .setPositiveButton("保存并打开", null)
                .setNeutralButton("恢复默认", (d, w) -> applyBaseUrl(DEFAULT_URL))
                .setNegativeButton("取消", null)
                .create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String url = normalizeUrl(input.getText().toString());
            if (url == null) {
                input.setError("地址格式不正确");
                return;
            }
            dialog.dismiss();
            applyBaseUrl(url);
        }));
        input.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();
                return true;
            }
            return false;
        });
        show(dialog);
    }

    private void showMenuDialog() {
        final List<String> labels = new ArrayList<>();
        final List<Runnable> actions = new ArrayList<>();
        labels.add("退出应用"); actions.add(this::finish);
        labels.add("修改域名"); actions.add(this::showDomainDialog);
        labels.add("刷新页面"); actions.add(webView::reload);
        labels.add("返回首页"); actions.add(() -> {
            clearHistoryOnFinish = true;
            webView.loadUrl(getBaseUrl());
        });
        labels.add("清除缓存"); actions.add(() -> {
            webView.clearCache(true);
            Toast.makeText(this, "缓存已清除", Toast.LENGTH_SHORT).show();
            webView.reload();
        });
        if (Flavor.TV) {
            labels.add("遥控鼠标：" + (cursor.isCursorEnabled() ? "开（点击关闭）" : "关（点击开启）"));
            actions.add(() -> {
                boolean on = !cursor.isCursorEnabled();
                cursor.setCursorEnabled(on);
                prefs.edit().putBoolean(KEY_CURSOR, on).apply();
            });
            labels.add("网页版式：" + (prefs.getBoolean(KEY_DESKTOP, false) ? "电脑版（点击切到手机版）" : "手机版（点击切到电脑版）"));
            actions.add(() -> {
                prefs.edit().putBoolean(KEY_DESKTOP, !prefs.getBoolean(KEY_DESKTOP, false)).apply();
                applyUserAgent();
                webView.reload();
            });
            labels.add("关于"); actions.add(this::showAbout);
        }
        show(new AlertDialog.Builder(this)
                .setTitle(getString(R.string.app_name))
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .setNegativeButton("取消", null)
                .create());
    }

    private void applyUserAgent() {
        webView.getSettings().setUserAgentString(
                prefs.getBoolean(KEY_DESKTOP, false) ? DESKTOP_UA : defaultUserAgent);
    }

    private void showAbout() {
        String version = "?";
        try {
            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
        }
        String webViewVersion = "未知";
        if (Build.VERSION.SDK_INT >= 26 && WebView.getCurrentWebViewPackage() != null) {
            webViewVersion = WebView.getCurrentWebViewPackage().packageName + " "
                    + WebView.getCurrentWebViewPackage().versionName;
        } else {
            String ua = defaultUserAgent;
            int i = ua.indexOf("Chrome/");
            if (i >= 0) webViewVersion = ua.substring(i).split(" ")[0];
        }
        show(new AlertDialog.Builder(this)
                .setTitle("关于")
                .setMessage("应用版本：" + version
                        + "\n包名：" + getPackageName()
                        + "\n系统：Android " + Build.VERSION.RELEASE + "（API " + Build.VERSION.SDK_INT + "）"
                        + "\n设备：" + Build.MANUFACTURER + " " + Build.MODEL
                        + "\nCPU：" + Build.SUPPORTED_ABIS[0]
                        + "\nWebView：" + webViewVersion
                        + "\n当前地址：" + getBaseUrl()
                        + "\n\n遥控器：方向键移动指针，OK 键点击，指针推到屏幕边缘可滚动；"
                        + "菜单键或长按返回键打开菜单。")
                .setPositiveButton("确定", null)
                .create());
    }

    private void showLoadError(String desc) {
        if (isFinishing() || (activeDialog != null && activeDialog.isShowing())) return;
        show(new AlertDialog.Builder(this)
                .setTitle("页面加载失败")
                .setMessage("地址：" + getBaseUrl() + "\n原因：" + desc + "\n\n如果网站域名已更换，请点击「修改域名」。")
                .setPositiveButton("重试", (d, w) -> webView.reload())
                .setNeutralButton("修改域名", (d, w) -> showDomainDialog())
                .setNegativeButton("退出", (d, w) -> finish())
                .create());
    }

    private void show(AlertDialog dialog) {
        if (isFinishing()) return;
        if (activeDialog != null && activeDialog.isShowing()) activeDialog.dismiss();
        activeDialog = dialog;
        dialog.show();
    }

    // ---------------- 按键 ----------------

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (Flavor.TV) {
            if (cursor.handleKey(event)) return true;
            int code = event.getKeyCode();
            if (code == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE || code == KeyEvent.KEYCODE_MEDIA_PLAY
                    || code == KeyEvent.KEYCODE_MEDIA_PAUSE) {
                if (event.getAction() == KeyEvent.ACTION_DOWN) {
                    String op = code == KeyEvent.KEYCODE_MEDIA_PLAY ? "v.play()"
                            : code == KeyEvent.KEYCODE_MEDIA_PAUSE ? "v.pause()"
                            : "(v.paused?v.play():v.pause())";
                    webView.evaluateJavascript("(function(){var v=document.querySelector('video');if(v)" + op + ";})()", null);
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event.startTracking();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MENU || keyCode == KeyEvent.KEYCODE_SETTINGS) {
            showMenuDialog();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            showMenuDialog();
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.isTracking() && !event.isCanceled()) {
                onBackPressed();
            }
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (customView != null) {
            exitFullscreen();
        } else if (webView.canGoBack()) {
            webView.goBack();
        } else {
            showMenuDialog();
        }
    }

    // ---------------- 生命周期 ----------------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        if (customView != null) applyImmersive(true);
    }

    @Override
    protected void onPause() {
        webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (activeDialog != null) activeDialog.dismiss();
        root.removeView(webView);
        webView.destroy();
        super.onDestroy();
    }
}
