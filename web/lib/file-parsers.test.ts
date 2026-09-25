import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  UploadError,
  htmlToText,
  mimeForUpload,
  parseCsv,
  parseUpload,
  sha256Hex,
  uploadExtension,
} from "@/lib/file-parsers";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("uploadExtension", () => {
  it("recognises supported types case-insensitively", () => {
    expect(uploadExtension("Vokabeln.XLSX")).toBe(".xlsx");
    expect(uploadExtension("notes.md")).toBe(".md");
    expect(uploadExtension("scan.pdf")).toBeNull();
    expect(uploadExtension("noextension")).toBeNull();
  });
  it("maps to a mime type", () => expect(mimeForUpload("a.csv")).toBe("text/csv"));
});

describe("parseCsv", () => {
  it("strips a BOM, keeps quoted commas, drops blank lines", () => {
    const csv = '\uFEFFDeutsch,English\n"der Hund, groß",the big dog\n\n , \ndie Katze,the cat\n';
    expect(parseCsv(csv)).toEqual([
      ["Deutsch", "English"],
      ["der Hund, groß", "the big dog"],
      ["die Katze", "the cat"],
    ]);
  });
  it("returns no rows for a blank file", () => expect(parseCsv("\n , \n")).toEqual([]));
});

describe("htmlToText", () => {
  it("turns headings into markdown and decodes entities", () => {
    const html = "<h1>Dativ</h1><p>mit &amp; nach</p><h2>Liste</h2><ul><li>eins</li><li>zwei</li></ul>";
    expect(htmlToText(html)).toBe("# Dativ\n\nmit & nach\n\n## Liste\n\n- eins\n- zwei");
  });
});

describe("parseUpload", () => {
  it("reads an xlsx as rows, dropping blank rows and stringifying numbers", async () => {
    const out = await parseUpload("vocab.xlsx", fixture("vocab.xlsx"));
    expect(out).toEqual({
      kind: "rows",
      rows: [
        ["Deutsch", "English"],
        ["der Hund", "the dog"],
        ["die Katze", "the cat"],
        ["Anzahl", "3"],
      ],
    });
  });

  it("reads a docx as text with headings preserved", async () => {
    const out = await parseUpload("notes.docx", fixture("notes.docx"));
    expect(out.kind).toBe("text");
    const text = out.kind === "text" ? out.text : "";
    expect(text).toContain("# Dativ");
    expect(text).toContain("## Akkusativ");
    expect(text).toContain("Ich helfe dem Mann & der Frau.");
  });

  it("reads txt and md as text", async () => {
    const out = await parseUpload("n.md", Buffer.from("\uFEFF# Titel\n\nText"));
    expect(out).toEqual({ kind: "text", text: "# Titel\n\nText" });
  });

  it("rejects unsupported types with 400", async () => {
    await expect(parseUpload("scan.pdf", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
  });

  it("rejects files over 2 MB with 400", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1);
    await expect(parseUpload("big.txt", big)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a corrupt xlsx with 422", async () => {
    const err = await parseUpload("bad.xlsx", Buffer.from("not a zip")).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.status).toBe(422);
  });
});

describe("sha256Hex", () => {
  it("hashes bytes", () =>
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    ));
});
