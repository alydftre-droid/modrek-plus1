# =====================================================================
# Modrek Plus — ProGuard / R8 rules
# ---------------------------------------------------------------------
# هذا التطبيق مبني على Capacitor (WebView). كل منطق العمل داخل حزمة
# JavaScript، والطبقة الأصلية (Java) رقيقة جدًا وتعتمد بشكل كامل على
# الـ Reflection من جسر Capacitor ومن Google Credential Manager.
# القواعد التالية تحافظ على كل ما يعتمد عليه الجسر أو الـ SDKs.
# =====================================================================

# --- Debug info (يساعد في قراءة الـ stack traces من Play Console) ---
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature, Exceptions
-renamesourcefileattribute SourceFile

# --- WebView JS interfaces ---
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# =====================================================================
# Capacitor core + جميع الإضافات
# جسر Capacitor يستدعي الـ plugins عبر reflection بناءً على أسماء
# الميثودات المُعلَّمة بـ @PluginMethod، لذا نحافظ عليها بالكامل.
# =====================================================================
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class com.getcapacitor.community.** { *; }

-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod <methods>;
    public <init>(...);
}
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod <methods>;
}

# إضافتنا المخصصة لتسجيل الدخول بجوجل
-keep class com.modrek.plus.** { *; }

# =====================================================================
# AndroidX Credential Manager + Google Identity (Sign in with Google)
# =====================================================================
-keep class androidx.credentials.** { *; }
-keep interface androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-keep interface com.google.android.libraries.identity.googleid.** { *; }
-dontwarn androidx.credentials.**
-dontwarn com.google.android.libraries.identity.googleid.**

# Google Play Services (يستخدمه credentials-play-services-auth)
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# =====================================================================
# Kotlin / Coroutines (تستخدمها بعض مكتبات AndroidX الحديثة)
# =====================================================================
-keep class kotlin.Metadata { *; }
-keep class kotlin.coroutines.Continuation
-dontwarn kotlinx.coroutines.**
-dontwarn kotlin.**

# =====================================================================
# JSON / org.json (يستخدمه جسر Capacitor وإضافتنا)
# =====================================================================
-keep class org.json.** { *; }

# =====================================================================
# Cordova (بعض الإضافات القديمة تُدمج عبر capacitor-cordova-android-plugins)
# =====================================================================
-keep class org.apache.cordova.** { *; }
-keep interface org.apache.cordova.** { *; }
-dontwarn org.apache.cordova.**

# =====================================================================
# قواعد عامة آمنة
# =====================================================================
# لا تُحذف الـ enums (تُستخدم عبر valueOf)
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Parcelables
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Serializables
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Views المُنفَّخة من XML عبر reflection
-keep public class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
    public void set*(...);
}

# منع تحذيرات مزعجة من مكتبات اختيارية غير موجودة
-dontwarn java.lang.invoke.**
-dontwarn javax.annotation.**
