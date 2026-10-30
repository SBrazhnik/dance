package ru.danceclub.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Message;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/**
 * Оболочка для веб-приложения клуба (Google Apps Script).
 * Адрес берётся из сборки (BuildConfig.APP_URL) или вводится при первом запуске.
 */
public class MainActivity extends Activity {
    private static final int NAVY = Color.parseColor("#253559");
    private WebView web;
    private View splash;
    private SharedPreferences prefs;
    private boolean loadedOnce = false;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("app", MODE_PRIVATE);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(NAVY);
        web = new WebView(this);
        web.setBackgroundColor(NAVY);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        splash = buildSplash();
        root.addView(splash, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " DanceClubApp/1.0");

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return route(req.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (!url.startsWith("data:")) loadedOnce = true;
                splash.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(String.valueOf(err.getDescription()));
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message resultMsg) {
                // Ссылки target=_blank (PDF актов, Google Документы) открываем во внешнем браузере
                WebView tmp = new WebView(MainActivity.this);
                tmp.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                        openExternal(r.getUrl());
                        v.destroy();
                        return true;
                    }
                });
                WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                t.setWebView(tmp);
                resultMsg.sendToTarget();
                return true;
            }
        });

        web.setDownloadListener((url, ua, cd, mime, len) -> openExternal(Uri.parse(url)));

        if (state != null) {
            web.restoreState(state);
        } else {
            start();
        }
    }

    private View buildSplash() {
        LinearLayout l = new LinearLayout(this);
        l.setOrientation(LinearLayout.VERTICAL);
        l.setGravity(Gravity.CENTER);
        l.setBackgroundColor(NAVY);
        ImageView img = new ImageView(this);
        img.setImageResource(R.drawable.splash_logo);
        int px = (int) (150 * getResources().getDisplayMetrics().density);
        l.addView(img, new LinearLayout.LayoutParams(px, px));
        TextView t = new TextView(this);
        t.setText(R.string.club_full);
        t.setTextColor(Color.WHITE);
        t.setTextSize(19);
        t.setGravity(Gravity.CENTER);
        t.setPadding(40, 36, 40, 30);
        l.addView(t);
        ProgressBar pb = new ProgressBar(this);
        l.addView(pb);
        return l;
    }

    private String appUrl() {
        String u = prefs.getString("url", "");
        if (u.isEmpty()) u = BuildConfig.APP_URL;
        return u == null ? "" : u.trim();
    }

    private void start() {
        String u = appUrl();
        if (u.isEmpty()) askUrl(false);
        else {
            splash.setVisibility(View.VISIBLE);
            web.loadUrl(u);
        }
    }

    /** Внутри приложения — только страницы Apps Script; остальное — во внешних приложениях. */
    private boolean route(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        if (scheme.equals("app") && host.equals("settings")) { askUrl(true); return true; }
        if (scheme.equals("app") && host.equals("retry")) { start(); return true; }
        if (scheme.equals("http") || scheme.equals("https")) {
            if (host.equals("script.google.com") || host.endsWith(".googleusercontent.com")
                    || host.equals("accounts.google.com")) return false;
        }
        openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            Intent i = new Intent(uri.getScheme() != null && uri.getScheme().equals("tel") ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, uri);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Нет приложения, чтобы открыть ссылку", Toast.LENGTH_SHORT).show();
        }
    }

    private void askUrl(boolean cancelable) {
        final EditText et = new EditText(this);
        et.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        et.setHint("https://script.google.com/macros/s/…/exec");
        et.setText(appUrl());
        FrameLayout box = new FrameLayout(this);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(et, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        AlertDialog.Builder b = new AlertDialog.Builder(this)
                .setTitle("Адрес приложения клуба")
                .setMessage("Вставьте ссылку на веб-приложение, которую дал администратор.")
                .setView(box)
                .setCancelable(cancelable)
                .setPositiveButton("Сохранить", (d, w) -> {
                    String u = et.getText().toString().trim();
                    if (!u.startsWith("https://")) {
                        Toast.makeText(this, "Ссылка должна начинаться с https://", Toast.LENGTH_LONG).show();
                        askUrl(cancelable);
                        return;
                    }
                    prefs.edit().putString("url", u).apply();
                    start();
                });
        if (cancelable) b.setNegativeButton("Отмена", null);
        b.show();
    }

    private void showOffline(String why) {
        splash.setVisibility(View.GONE);
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                + "<body style='margin:0;font-family:sans-serif;background:#253559;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'>"
                + "<div style='padding:24px'><div style='font-size:46px'>⚠</div><h2>Нет связи с сервером</h2>"
                + "<p style='opacity:.75'>Проверьте интернет и попробуйте снова.</p>"
                + "<p><a href='app://retry' style='display:inline-block;background:#C9A24A;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:bold'>Повторить</a></p>"
                + "<p><a href='app://settings' style='color:#fff;opacity:.6;font-size:14px'>Изменить адрес приложения</a></p>"
                + "<p style='opacity:.4;font-size:12px'>" + android.text.Html.escapeHtml(why) + "</p></div></body></html>";
        web.loadDataWithBaseURL("https://script.google.com/", html, "text/html", "utf-8", null);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
