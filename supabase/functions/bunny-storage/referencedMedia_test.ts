import { assertEquals } from "jsr:@std/assert@1";
import { canReadReferencedMedia } from "./referencedMedia.ts";

function client(visible: Record<string, Record<string, string>[]>) {
  return { from: (table: string) => ({ select: (_id: string) => ({
    in: (column: string, refs: string[]) => ({ limit: async (_n: number) => ({
      data: (visible[table] || []).filter(row => refs.includes(row[column])), error: null,
    }) }),
  }) }) };
}
const path = "modrek/users/teacher/profile/photo.jpg";
Deno.test("student can read a visible teacher profile photo in the teacher owner folder", async () => {
  assertEquals(await canReadReferencedMedia(client({ teacher_profiles: [{ photo_url: `bstorage://${path}` }] }), path, "cdn.test"), true);
});
Deno.test("recipient can read a teacher message image through its visible message row", async () => {
  assertEquals(await canReadReferencedMedia(client({ teacher_messages: [{ file_url: `bstorage://${path}` }] }), path, "cdn.test"), true);
});
Deno.test("support recipient can read a visible reply image stored as a CDN reference", async () => {
  assertEquals(await canReadReferencedMedia(client({ support_messages: [{ file_url: `https://cdn.test/${path}` }] }), path, "cdn.test"), true);
});
Deno.test("unrelated user or tenant cannot read an image with no visible reference", async () => {
  assertEquals(await canReadReferencedMedia(client({}), path, "cdn.test"), false);
});
Deno.test("a different visible attachment does not grant access to an arbitrary owner file", async () => {
  assertEquals(await canReadReferencedMedia(client({ teacher_messages: [{ file_url: "bstorage://modrek/users/other/chat/other.jpg" }] }), path, "cdn.test"), false);
});