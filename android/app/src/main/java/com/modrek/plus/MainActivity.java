package com.modrek.plus;

import android.os.Bundle;
import android.webkit.WebSettings;
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
}
