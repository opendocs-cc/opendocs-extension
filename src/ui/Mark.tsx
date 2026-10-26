import markSvg from "./opendocs-mark.svg?raw";

// Inlined, so the card on chat pages needs no web-accessible resources.
const MARK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg)}`;

/** The OpenDocs mark (the brand's own SVG, from opendocs.cc). */
export function Mark({ size = 18 }: { size?: number }) {
  return <img className="od-mark" src={MARK} width={size} height={size} alt="" />;
}

export const MARK_DATA_URL = MARK;
