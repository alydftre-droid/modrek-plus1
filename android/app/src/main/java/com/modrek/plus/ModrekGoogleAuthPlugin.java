package com.modrek.plus;

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
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "ModrekGoogleAuth")
public class ModrekGoogleAuthPlugin extends Plugin {
    private static final String TAG = "ModrekGoogleAuth";
    private CredentialManager credentialManager;

    @Override
    public void load() {
        credentialManager = CredentialManager.create(getContext());
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = call.getString("webClientId", "");
        String nonce = call.getString("nonce", "");

        if (webClientId == null || webClientId.trim().isEmpty()) {
            call.reject("GOOGLE_WEB_CLIENT_ID_MISSING");
            return;
        }

        GetSignInWithGoogleOption.Builder googleOptionBuilder = new GetSignInWithGoogleOption.Builder(webClientId.trim());
        if (nonce != null && !nonce.isEmpty()) {
            googleOptionBuilder.setNonce(nonce);
        }

        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(googleOptionBuilder.build())
            .build();

        credentialManager.getCredentialAsync(
            getContext(),
            request,
            null,
            Executors.newSingleThreadExecutor(),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(@NonNull GetCredentialException e) {
                    Log.e(TAG, "Google Credential Manager failed", e);
                    call.reject("GOOGLE_CREDENTIAL_MANAGER_FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage());
                }
            }
        );
    }

    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        credentialManager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            null,
            Executors.newSingleThreadExecutor(),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void result) {
                    JSObject response = new JSObject();
                    response.put("cleared", true);
                    call.resolve(response);
                }

                @Override
                public void onError(@NonNull ClearCredentialException e) {
                    Log.e(TAG, "Failed to clear Google credential state", e);
                    call.reject("GOOGLE_CREDENTIAL_CLEAR_FAILED: " + e.getClass().getSimpleName() + ": " + e.getMessage());
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