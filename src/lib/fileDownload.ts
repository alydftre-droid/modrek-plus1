import { Capacitor } from "@capacitor/core";

/**
 * Cross-platform file saving.
 *
 * In a browser we use the classic anchor[download] trick. Inside the Android
 * app (Capacitor WebView) that trick silently does nothing — blob:/data: URLs
 * are not handled by the WebView download manager — so we write the bytes to
 * the app cache and hand the file to the system share/open sheet instead.
 */

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف"));
    reader.readAsDataURL(blob);
  });
}

function saveInBrowser(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveOnDevice(filename: string, blob: Blob) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const data = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data,
    directory: Directory.Cache,
    recursive: true,
  });
  try {
    await Share.share({
      title: filename,
      url: written.uri,
      dialogTitle: "حفظ الملف أو مشاركته",
    });
  } catch {
    /* the user dismissed the sheet — the file is already written */
  }
  return written.uri;
}

/** Saves a blob as a file on web and on the Android app. */
export async function saveFile(filename: string, blob: Blob) {
  if (isNative()) {
    await saveOnDevice(filename, blob);
    return;
  }
  saveInBrowser(filename, blob);
}

/** Saves a jsPDF document (works inside the Android app too). */
export async function savePdfDocument(filename: string, pdf: { output: (type: string) => unknown }) {
  const name = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  const blob = pdf.output("blob") as Blob;
  await saveFile(name, blob);
}
