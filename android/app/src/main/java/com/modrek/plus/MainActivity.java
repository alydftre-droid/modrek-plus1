package com.modrek.plus;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import com.capacitorjs.plugins.app.AppPlugin;
import com.capacitorjs.plugins.haptics.HapticsPlugin;
import com.capacitorjs.plugins.keyboard.KeyboardPlugin;
import com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin;
import com.capacitorjs.plugins.network.NetworkPlugin;
import com.capacitorjs.plugins.preferences.PreferencesPlugin;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.capacitorjs.plugins.screenorientation.ScreenOrientationPlugin;
import com.capacitorjs.plugins.splashscreen.SplashScreenPlugin;
import com.capacitorjs.plugins.statusbar.StatusBarPlugin;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;
import com.getcapacitor.community.tts.TextToSpeechPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // تسجيل الإضافات الأصلية يدوياً قبل super لضمان ثبات نسخة Android حتى لو لم يتولد ملف capacitor.plugins.json.
        registerPlugin(TextToSpeechPlugin.class);
        registerPlugin(AppPlugin.class);
        registerPlugin(HapticsPlugin.class);
        registerPlugin(KeyboardPlugin.class);
        registerPlugin(LocalNotificationsPlugin.class);
        registerPlugin(NetworkPlugin.class);
        registerPlugin(PreferencesPlugin.class);
        registerPlugin(PushNotificationsPlugin.class);
        registerPlugin(ScreenOrientationPlugin.class);
        registerPlugin(SocialLoginPlugin.class);
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

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN || requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            return;
        }

        PluginHandle pluginHandle = getBridge() == null ? null : getBridge().getPlugin("SocialLogin");
        if (pluginHandle == null) {
            Log.e("ModrekGoogleAuth", "SocialLogin plugin handle is missing");
            return;
        }

        Plugin plugin = pluginHandle.getInstance();
        if (!(plugin instanceof SocialLoginPlugin)) {
            Log.e("ModrekGoogleAuth", "SocialLogin plugin instance is invalid");
            return;
        }

        ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // Required marker for @capgo/capacitor-social-login Google authorization flow.
    }
}
