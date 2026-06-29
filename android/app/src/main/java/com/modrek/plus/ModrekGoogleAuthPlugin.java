package com.modrek.plus;

import android.app.Activity;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.Base64;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "ModrekGoogleAuth")
public class ModrekGoogleAuthPlugin extends Plugin {
    private static final String TAG = "ModrekGoogleAuth";
    private static final String TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL = "com.google.android.libraries.identity.googleid.TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL";
    private CredentialManager credentialManager;
    private CancellationSignal cancellationSignal;
    private final java.util.concurrent.Executor credentialExecutor = Executors.newSingleThreadExecutor();

    @Override
    public void load() {
        credentialManager = CredentialManager.create(getContext());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("GOOGLE_ACTIVITY_NOT_AVAILABLE");
            return;
        }

        String webClientId = call.getString("webClientId", "");
        String nonce = call.getString("nonce", "");

        if (webClientId == null || webClientId.trim().isEmpty()) {
            call.reject("GOOGLE_WEB_CLIENT_ID_MISSING");
            return;
        }

        String cleanWebClientId = webClientId.trim();
        String cleanNonce = nonce == null ? "" : nonce.trim();

        // 1. First attempt: GetSignInWithGoogleOption (Optimized for button click)
        GetSignInWithGoogleOption.Builder buttonFlowBuilder = new GetSignInWithGoogleOption.Builder(cleanWebClientId);
        if (!cleanNonce.isEmpty()) {
            buttonFlowBuilder.setNonce(cleanNonce);
        }

        GetCredentialRequest buttonFlowRequest = new GetCredentialRequest.Builder()
            .addCredentialOption(buttonFlowBuilder.build())
            .build();

        cancellationSignal = new CancellationSignal();

        // Fallback logic: if the button-flow fails for ANY reason, try the discovery flow.
        // Some devices/accounts have issues with the button-flow API if the Android client is misconfigured.
        requestCredential(call, activity, buttonFlowRequest, "button-flow", () -> {
            GetGoogleIdOption.Builder googleOptionBuilder = new GetGoogleIdOption.Builder()
                .setServerClientId(cleanWebClientId)
                .setFilterByAuthorizedAccounts(false)
                .setAutoSelectEnabled(false);
            if (!cleanNonce.isEmpty()) {
                googleOptionBuilder.setNonce(cleanNonce);
            }

            GetCredentialRequest credentialDiscoveryRequest = new GetCredentialRequest.Builder()
                .addCredentialOption(googleOptionBuilder.build())
                .build();
            requestCredential(call, activity, credentialDiscoveryRequest, "credential-discovery", null);
        });
    }

    private void requestCredential(
        PluginCall call,
        Activity activity,
        GetCredentialRequest request,
        String flowName,
        Runnable nextAttempt
    ) {
        credentialManager.getCredentialAsync(
            activity,
            request,
            cancellationSignal,
            credentialExecutor,
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    activity.runOnUiThread(() -> handleCredentialResult(call, result, flowName));
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    Log.e(TAG, "Google Credential Manager failed in " + flowName, e);
                    // Fallback to next attempt if available
                    if (nextAttempt != null) {
                        activity.runOnUiThread(nextAttempt);
                        return;
                    }
                    activity.runOnUiThread(() -> call.reject(buildCredentialError(flowName, e)));
                }
            }
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (cancellationSignal != null) {
            cancellationSignal.cancel();
            cancellationSignal = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        Activity activity = getActivity();
        credentialManager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            null,
            credentialExecutor,
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void result) {
                    Runnable resolver = () -> {
                        JSObject response = new JSObject();
                        response.put("cleared", true);
                        call.resolve(response);
                    };
                    if (activity != null) activity.runOnUiThread(resolver);
                    else resolver.run();
                }

                @Override
                public void onError(@NonNull ClearCredentialException e) {
                    Log.e(TAG, "Failed to clear Google credential state", e);
                    Runnable rejecter = () -> call.reject("GOOGLE_CREDENTIAL_CLEAR_FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                    if (activity != null) activity.runOnUiThread(rejecter);
                    else rejecter.run();
                }
            }
        );
    }

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result, String flowName) {
        try {
            Credential credential = result.getCredential();
            if (!(credential instanceof CustomCredential)) {
                call.reject("GOOGLE_CREDENTIAL_TYPE_INVALID");
                return;
            }

            CustomCredential customCredential = (CustomCredential) credential;
            String credentialType = customCredential.getType();
            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credentialType)
                && !TYPE_GOOGLE_ID_TOKEN_SIWG_CREDENTIAL.equals(credentialType)) {
                call.reject("GOOGLE_ID_TOKEN_CREDENTIAL_MISSING: " + credentialType);
                return;
            }

            GoogleIdTokenCredential googleCredential = GoogleIdTokenCredential.createFrom(customCredential.getData());
            String idToken = googleCredential.getIdToken();
            if (idToken == null || idToken.trim().isEmpty()) {
                call.reject("GOOGLE_ID_TOKEN_EMPTY");
                return;
            }

            JSObject response = new JSObject();
            response.put("idToken", idToken);
            response.put("responseType", "id_token");
            response.put("flow", flowName);
            response.put("profile", buildProfile(googleCredential, idToken));
            call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "Failed to parse Google ID token credential", e);
            call.reject("GOOGLE_ID_TOKEN_PARSE_FAILED: " + e.getMessage());
        }
    }

    private JSObject buildProfile(GoogleIdTokenCredential credential, String idToken) {
        JSObject profile = new JSObject();
        profile.put("id", readJwtClaim(idToken, "sub"));
        profile.put("email", credential.getId());
        profile.put("name", credential.getDisplayName());
        profile.put("familyName", credential.getFamilyName());
        profile.put("givenName", credential.getGivenName());
        profile.put("imageUrl", credential.getProfilePictureUri() == null ? null : credential.getProfilePictureUri().toString());
        return profile;
    }

    private String readJwtClaim(String idToken, String claim) {
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length < 2) return null;
            byte[] decoded = Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
            JSONObject payload = new JSONObject(new String(decoded, StandardCharsets.UTF_8));
            return payload.optString(claim, null);
        } catch (Exception e) {
            return null;
        }
    }

    private String buildCredentialError(String flowName, GetCredentialException e) {
        String message = e.getMessage() == null ? "" : e.getMessage();
        String packageName = getContext().getPackageName();
        String sha1 = getAppSignatureSha1();
        
        String base = "GOOGLE_CREDENTIAL_MANAGER_FAILED: " + e.getClass().getSimpleName() + ": " + message;
        String diag = " | flow=" + flowName + " | pkg=" + packageName + " | sha1=" + sha1;
        
        if (e instanceof NoCredentialException || message.toLowerCase().contains("client") || message.toLowerCase().contains("developer")) {
            return base + diag + " | cause=CHECK_GOOGLE_CLOUD_ANDROID_OAUTH_CLIENT_AND_SHA1";
        }
        return base + diag;
    }

    private String getAppSignatureSha1() {
        try {
            PackageManager pm = getContext().getPackageManager();
            String packageName = getContext().getPackageName();
            Signature[] signatures;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES);
                SigningInfo signingInfo = packageInfo.signingInfo;
                if (signingInfo != null) {
                    if (signingInfo.hasMultipleSigners()) {
                        signatures = signingInfo.getApkContentsSigners();
                    } else {
                        signatures = signingInfo.getSigningCertificateHistory();
                    }
                } else {
                    return "SIGNING_INFO_NULL";
                }
            } else {
                signatures = pm.getPackageInfo(packageName, PackageManager.GET_SIGNATURES).signatures;
            }

            if (signatures == null || signatures.length == 0) return "NO_SIGNATURES";

            for (Signature signature : signatures) {
                MessageDigest md = MessageDigest.getInstance("SHA-1");
                md.update(signature.toByteArray());
                byte[] digest = md.digest();
                StringBuilder hexString = new StringBuilder();
                for (byte b : digest) {
                    String append = Integer.toHexString(0xFF & b);
                    if (append.length() == 1) hexString.append("0");
                    hexString.append(append);
                }
                return hexString.toString().toUpperCase().replaceAll("..(?!$)", "$0:");
            }
        } catch (Exception e) {
            return "ERROR_" + e.getMessage();
        }
        return "NOT_FOUND";
    }
}
