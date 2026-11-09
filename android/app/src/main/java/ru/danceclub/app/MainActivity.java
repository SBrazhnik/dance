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
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
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

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Оболочка для веб-приложения клуба (Google Apps Script).
 * Адрес берётся из сборки (BuildConfig.APP_URL) или вводится при первом запуске.
 */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 41;
    private ValueCallback<Uri[]> fileCb;
    private static final int NAVY = Color.parseColor("#121721");
    private WebView web;
    private View splash;
    private SharedPreferences prefs;
    private boolean loadedOnce = false;
    private WebView printView; // держим ссылку, пока идёт печать

    /** Мост для страницы: печать документов и открытие файлов (акты, договоры, CSV). */
    public class Bridge {
        @JavascriptInterface
        public void print(final String title, final String html) {
            runOnUiThread(() -> doPrint(title, html));
        }

        /** Номер сборки APK — страница сравнивает его с последним релизом. */
        @JavascriptInterface
        public int versionCode() { return BuildConfig.VERSION_CODE; }

        /** Скачать новую сборку и открыть установщик Android. */
        @JavascriptInterface
        public void installUpdate(final String url) {
            runOnUiThread(() -> startUpdate(url));
        }

        @JavascriptInterface
        public void openFile(final String name, final String mime, final String base64) {
            runOnUiThread(() -> doOpenFile(name, mime, base64));
        }
    }

    private void doPrint(String title, String html) {
        final String jobName = (title == null || title.isEmpty()) ? getString(R.string.app_name) : title;
        final WebView pw = new WebView(this);
        pw.getSettings().setJavaScriptEnabled(false);
        pw.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                pm.print(jobName, adapter, new PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            }
        });
        printView = pw;
        pw.loadDataWithBaseURL("https://script.google.com/", html, "text/html", "utf-8", null);
    }

    // ---------- обновление приложения ----------
    private static final String UPD_FILE = "DanceClub-update.apk";
    private boolean updBusy = false, updWaitPerm = false;
    private AlertDialog updDlg;
    private ProgressBar updBar;
    private TextView updTxt;

    private static boolean trustedApkUrl(String u) {
        return u != null && (u.startsWith("https://github.com/SBrazhnik/dance/releases/")
                || u.startsWith("https://corpdance.ru/"));
    }

    private void jsUpd(String state) {
        if (web != null) web.evaluateJavascript("window.apkUpdState&&apkUpdState('" + state + "')", null);
    }

    private void startUpdate(final String url) {
        if (updBusy) return;
        if (!trustedApkUrl(url)) { Toast.makeText(this, "Неизвестный адрес обновления", Toast.LENGTH_LONG).show(); return; }
        updBusy = true;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (22 * getResources().getDisplayMetrics().density);
        box.setPadding(pad, pad / 2, pad, 0);
        updTxt = new TextView(this);
        updTxt.setText("Скачиваем новую версию…");
        box.addView(updTxt);
        updBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        updBar.setIndeterminate(true);
        updBar.setMax(100);
        box.addView(updBar, new LinearLayout.LayoutParams(-1, -2));
        updDlg = new AlertDialog.Builder(this).setTitle("Обновление приложения").setView(box).setCancelable(false).create();
        updDlg.show();
        jsUpd("download");
        new Thread(() -> {
            String err = null;
            File f = new File(new File(getCacheDir(), "shared"), UPD_FILE);
            try {
                File dir = f.getParentFile();
                if (dir != null && !dir.exists() && !dir.mkdirs()) throw new Exception("нет доступа к памяти");
                String u = url;
                HttpURLConnection c = null;
                for (int i = 0; i < 6; i++) { // GitHub отдаёт файл через переадресацию
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setInstanceFollowRedirects(false);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(30000);
                    int code = c.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String loc = c.getHeaderField("Location");
                        c.disconnect();
                        if (loc == null || !loc.startsWith("https://")) throw new Exception("ошибка переадресации");
                        u = loc;
                        continue;
                    }
                    if (code != 200) throw new Exception("сервер ответил " + code);
                    break;
                }
                if (c == null) throw new Exception("нет ответа");
                final long total = c.getContentLength();
                long done = 0;
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(f)) {
                    byte[] buf = new byte[65536];
                    int n, last = -1;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n);
                        done += n;
                        if (total > 0) {
                            final int pct = (int) (done * 100 / total);
                            if (pct != last) {
                                last = pct;
                                runOnUiThread(() -> { updBar.setIndeterminate(false); updBar.setProgress(pct); updTxt.setText("Скачиваем новую версию… " + pct + "%"); });
                            }
                        }
                    }
                }
                c.disconnect();
                if (done < 100000) throw new Exception("файл повреждён");
            } catch (Exception e) {
                err = e.getMessage() == null ? e.toString() : e.getMessage();
            }
            final String fe = err;
            runOnUiThread(() -> {
                updBusy = false;
                if (updDlg != null) updDlg.dismiss();
                if (fe != null) {
                    jsUpd("error");
                    new AlertDialog.Builder(this).setTitle("Не удалось скачать обновление")
                            .setMessage(fe + "\n\nПроверьте интернет и попробуйте ещё раз.")
                            .setPositiveButton("Повторить", (d, w) -> startUpdate(url))
                            .setNegativeButton("Закрыть", null).show();
                } else installApk();
            });
        }).start();
    }

    /** Открыть системный установщик. На Android 8+ сначала нужно разрешить установку из этого приложения. */
    private void installApk() {
        if (android.os.Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            updWaitPerm = true;
            jsUpd("perm");
            new AlertDialog.Builder(this).setTitle("Нужно разрешение")
                    .setMessage("Android попросит разрешить установку обновлений из приложения клуба. Включите переключатель «Разрешить» и вернитесь назад — установка продолжится сама.")
                    .setPositiveButton("Открыть настройки", (d, w) -> {
                        try {
                            startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
                        } catch (ActivityNotFoundException e) {
                            updWaitPerm = false;
                            Toast.makeText(this, "Разрешите установку из неизвестных источников в настройках", Toast.LENGTH_LONG).show();
                        }
                    })
                    .setNegativeButton("Отмена", (d, w) -> { updWaitPerm = false; jsUpd("cancel"); }).show();
            return;
        }
        try {
            Uri uri = Uri.parse("content://" + SharedFileProvider.AUTHORITY + "/" + UPD_FILE);
            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            jsUpd("install");
        } catch (Exception e) {
            jsUpd("error");
            Toast.makeText(this, "Не удалось открыть установщик: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void doOpenFile(String name, String mime, String base64) {
        try {
            String safe = (name == null || name.isEmpty() ? "file" : name).replaceAll("[\\\\/:*?\"<>|]", "_");
            File dir = new File(getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("нет доступа к памяти");
            File f = new File(dir, safe);
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT));
            }
            Uri uri = Uri.parse("content://" + SharedFileProvider.AUTHORITY + "/" + Uri.encode(safe));
            String type = (mime == null || mime.isEmpty()) ? "application/octet-stream" : mime;
            Intent view = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, type)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            Intent send = new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "Сохранить или отправить: " + safe);
            if (view.resolveActivity(getPackageManager()) != null) {
                Intent pick = Intent.createChooser(view, "Открыть: " + safe);
                pick.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{send});
                startActivity(pick);
            } else {
                startActivity(chooser);
            }
        } catch (Exception e) {
            Toast.makeText(this, "Не удалось открыть файл: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

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
        // всегда свежая версия приложения: страницу не берём из кэша
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.clearCache(true);

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
                if (url.startsWith("https://script.google.com/")) {
                    // убираем служебную полосу Google «Это приложение создано пользователем Google Apps Script»
                    view.evaluateJavascript("(function(){var s=document.createElement('style');"
                            + "s.textContent='#warning,.warning-bar{display:none!important}';"
                            + "(document.head||document.documentElement).appendChild(s);})()", null);
                }
                splash.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) showOffline(String.valueOf(err.getDescription()));
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
                // выбор файла: фото профиля, скан договора
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent pick = params.createIntent();
                String[] acc = params.getAcceptTypes();
                boolean img = acc != null && acc.length > 0;
                if (acc != null) for (String t : acc) if (t == null || !t.startsWith("image/")) img = false;
                if (img) {
                    // фото: сразу галерея или камера, а не «все файлы»
                    pick = new Intent(Intent.ACTION_GET_CONTENT);
                    pick.addCategory(Intent.CATEGORY_OPENABLE);
                    pick.setType("image/*");
                }
                try {
                    startActivityForResult(pick, REQ_FILE);
                } catch (ActivityNotFoundException e) {
                    try {
                        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        i.setType("*/*");
                        startActivityForResult(Intent.createChooser(i, "Выберите файл"), REQ_FILE);
                    } catch (ActivityNotFoundException e2) {
                        fileCb = null;
                        Toast.makeText(MainActivity.this, "Нет приложения для выбора файлов", Toast.LENGTH_LONG).show();
                        return false;
                    }
                }
                return true;
            }

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

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setDownloadListener((url, ua, cd, mime, len) -> {
            if (url != null && (url.startsWith("http://") || url.startsWith("https://"))) openExternal(Uri.parse(url));
        });

        // старую сохранённую страницу не восстанавливаем — грузим текущую версию
        start();
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
                + "<body style='margin:0;font-family:sans-serif;background:#121721;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center'>"
                + "<div style='padding:24px'><div style='font-size:46px'>⚠</div><h2>Нет связи с сервером</h2>"
                + "<p style='opacity:.75'>Проверьте интернет и попробуйте снова.</p>"
                + "<p><a href='app://retry' style='display:inline-block;background:#3F3561;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:bold'>Повторить</a></p>"
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

    private long pausedAt = 0;

    @Override
    protected void onPause() {
        super.onPause();
        pausedAt = System.currentTimeMillis();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE) {
            if (fileCb != null) fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // вернулись из настроек разрешения — продолжаем установку обновления
        if (updWaitPerm && android.os.Build.VERSION.SDK_INT >= 26) {
            updWaitPerm = false;
            if (getPackageManager().canRequestPackageInstalls()) installApk();
            else { jsUpd("cancel"); Toast.makeText(this, "Установка не разрешена — обновление отменено", Toast.LENGTH_LONG).show(); }
        }
        // после долгого перерыва перезагружаем страницу, чтобы подтянуть обновления
        if (pausedAt > 0 && System.currentTimeMillis() - pausedAt > 20 * 60 * 1000L) {
            pausedAt = 0;
            start();
        }
    }
}
