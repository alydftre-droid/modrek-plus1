package com.modrek.plus;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.capacitorjs.plugins.app.AppPlugin;
import com.capacitorjs.plugins.browser.BrowserPlugin;
import com.capacitorjs.plugins.haptics.HapticsPlugin;
import com.capacitorjs.plugins.keyboard.KeyboardPlugin;
import com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin;
import com.capacitorjs.plugins.network.NetworkPlugin;
import com.capacitorjs.plugins.preferences.PreferencesPlugin;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.capacitorjs.plugins.screenorientation.ScreenOrientationPlugin;
import com.capacitorjs.plugins.splashscreen.SplashScreenPlugin;
import com.capacitorjs.plugins.statusbar.StatusBarPlugin;
import com.getcapacitor.community.tts.TextToSpeechPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // حماية ثابتة للتطبيق الأصلي: بعض نسخ Android المبنية من المستودع كانت تُحزم بدون
        // capacitor.plugins.json، فيظهر خطأ "Browser plugin is not implemented on android".
        // التسجيل اليدوي قبل super يضمن توفر Browser و App وباقي الإضافات حتى لو لم يتولد ملف السجل.
        registerPlugin(TextToSpeechPlugin.class);
        registerPlugin(AppPlugin.class);
        registerPlugin(BrowserPlugin.class);
        registerPlugin(HapticsPlugin.class);
        registerPlugin(KeyboardPlugin.class);
        registerPlugin(LocalNotificationsPlugin.class);
        registerPlugin(NetworkPlugin.class);
        registerPlugin(PreferencesPlugin.class);
        registerPlugin(PushNotificationsPlugin.class);
        registerPlugin(ScreenOrientationPlugin.class);
        registerPlugin(SplashScreenPlugin.class);
        registerPlugin(StatusBarPlugin.class);

        super.onCreate(savedInstanceState);

        if (this.bridge != null) {
            this.bridge.setWebViewClient(new ModrekOAuthWebViewClient(this.bridge));
        }

        // إصلاح مقاسات الواجهة على هواتف Redmi/MIUI/Xiaomi:
        // إجبار WebView على تجاهل إعدادات حجم الخط/العرض في النظام
        // واستخدام كثافة الجهاز الفعلية فقط بحيث تظهر الواجهة بنفس
        // المقاس الصحيح على كل الأجهزة بدون تكبير أو تصغير غير متوقع.
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setTextZoom(100);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }

    private static final class ModrekOAuthWebViewClient extends BridgeWebViewClient {
        private final com.getcapacitor.Bridge bridge;

        ModrekOAuthWebViewClient(com.getcapacitor.Bridge bridge) {
            super(bridge);
            this.bridge = bridge;
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (shouldOpenOutsideWebView(url)) {
                openExternal(url);
                return true;
            }
            return super.shouldOverrideUrlLoading(view, request);
        }

        @Deprecated
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (shouldOpenOutsideWebView(uri)) {
                openExternal(uri);
                return true;
            }
            return super.shouldOverrideUrlLoading(view, url);
        }

        private boolean shouldOpenOutsideWebView(Uri url) {
            String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase();
            String host = url.getHost() == null ? "" : url.getHost().toLowerCase();
            String path = url.getPath() == null ? "" : url.getPath();

            if ("intent".equals(scheme)) return true;
            if ("com.modrek.plus".equals(scheme)) return true;
            if (!"https".equals(scheme)) return false;

            // Keep normal app navigation inside the Capacitor WebView. OAuth is
            // started from JS with @capacitor/browser; if an old WebView path
            // reaches an Android intent URL, only that intent is opened outside.
            return false;
        }

        private void openExternal(Uri url) {
            try {
                Intent intent;
                if ("intent".equalsIgnoreCase(url.getScheme())) {
                    intent = Intent.parseUri(url.toString(), Intent.URI_INTENT_SCHEME);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    intent.setComponent(null);
                } else {
                    intent = new Intent(Intent.ACTION_VIEW, url);
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                }
                bridge.getContext().startActivity(intent);
            } catch (Exception firstError) {
                try {
                    Intent fallback = new Intent(Intent.ACTION_VIEW, Uri.parse(url.toString().replaceFirst("^intent://", "https://")));
                    fallback.addCategory(Intent.CATEGORY_BROWSABLE);
                    bridge.getContext().startActivity(fallback);
                } catch (ActivityNotFoundException ignored) {
                    // Keep the WebView stable; the JS layer will show the auth error.
                }
            }
        }
    }
}
