import { reqText } from "@/lib/validate";

/**
 * Cheap checks on what the CLIENT declares about an upload — name, size,
 * type — run before the bytes are read into memory or anything is touched.
 *
 * Not the security decision: validateUpload() / sniffContentType() still judge
 * the bytes themselves, and callers must keep calling them. This only refuses
 * the obviously wrong early (an empty name, a 2 GB "CV", an .exe) without
 * buffering it first. A blank or generic declared type is let through, because
 * some systems report "" or octet-stream for perfectly good .docx files and
 * the byte sniff decides those.
 */
export function precheckUpload(
  file: File,
  allowed: ReadonlySet<string> | ((type: string) => boolean),
  maxBytes: number,
  messages: { tooBig: string; badType: string },
): string | null {
  const name = reqText(file.name, "File name", 255);
  if (!name.ok) return name.error;
  if (!Number.isFinite(file.size) || file.size <= 0) return "That file appears to be empty.";
  if (file.size > maxBytes) return messages.tooBig;
  const type = file.type.trim().toLowerCase();
  const isAllowed = typeof allowed === "function" ? allowed(type) : allowed.has(type);
  if (type && type !== "application/octet-stream" && !isAllowed) return messages.badType;
  return null;
}

/** The cleaned display name to store (control characters stripped, trimmed). */
export function cleanFileName(file: File, max = 255): string {
  const name = reqText(file.name, "File name", 100000);
  return (name.ok ? name.value : "file").slice(0, max);
}
