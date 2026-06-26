package com.modrek.plus;

import android.app.Activity;
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
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "ModrekGoogleAuth")
public class ModrekGoogleAuthPlugin extends Plugin {
    private static final String TAG = "ModrekGoogleAuth";
    private CredentialManager credentialManager;
    private CancellationSignal cancellationSignal;

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

        GetGoogleIdOption.Builder googleOptionBuilder = new GetGoogleIdOption.Builder()
            .setServerClientId(webClientId.trim())
            .setFilterByAuthorizedAccounts(false)
            .setAutoSelectEnabled(false);
        if (nonce != null && !nonce.isEmpty()) {
            googleOptionBuilder.setNonce(nonce);
        }

        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(googleOptionBuilder.build())
            .build();

        cancellationSignal = new CancellationSignal();

        credentialManager.getCredentialAsync(
            activity,
            request,
            cancellationSignal,
            Executors.newSingleThreadExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    activity.runOnUiThread(() -> handleCredentialResult(call, result));
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    Log.e(TAG, "Google Credential Manager failed", e);
                    activity.runOnUiThread(() -> call.reject("GOOGLE_CREDENTIAL_MANAGER_FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage()));
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
            Executors.newSingleThreadExecutor(),
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

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result) {
        try {
            Credential credential = result.getCredential();
            if (!(credential instanceof CustomCredential)) {
                call.reject("GOOGLE_CREDENTIAL_TYPE_INVALID");
                return;
            }

            CustomCredential customCredential = (CustomCredential) credential;
            if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
                call.reject("GOOGLE_ID_TOKEN_CREDENTIAL_MISSING");
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
}