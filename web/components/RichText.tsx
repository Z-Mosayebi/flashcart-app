import { Fragment } from "react";
import { splitQuoted } from "@/lib/rich-text";

/** Renders text with 'single-quoted' keywords in bold, quotes kept. */
export default function RichText({ text }: { text: string }) {
  return (
    <>
      {splitQuoted(text).map((run, i) =>
        run.quoted ? (
          <strong key={i} className="font-semibold text-ink">
            {run.text}
          </strong>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        )
      )}
    </>
  );
}
