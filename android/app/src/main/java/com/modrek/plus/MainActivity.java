package com.modrek.plus;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // إصلاح مقاسات الواجهة على هواتف Redmi/MIUI/Xiaomi:
        // إجبار WebView على تجاهل إعدادات حجم الخط/العرض في النظام
        // واستخدام كثافة الجهاز الفعلية فقط بحيث تظهر الواجهة بنفس
        // المقاس الصحيح على كل الأجهزة بدون تكبير أو تصغير غير متوقع.
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings settings = this.bridge.getWebView().getSettings();
            settings.setTextZoom(100);
            settings.setLoadWithOverviewMode(false);
            settings.setUseWideViewPort(false);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
        }
    }
}
