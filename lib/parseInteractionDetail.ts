/**
 * Mirrors `parseInteractionDetail` in `client-dashboard/electron/main.ts` and
 * extension-bus `dashboard/index.html`, so audit UI matches BrowserScope / Electron.
 */
export type ParsedInteractionDetail = {
  action: string;
  source: string;
  text: string;
};

export function parseInteractionDetail(detail: string): ParsedInteractionDetail {
  if (typeof detail !== "string" || !detail) {
    return { action: "INTERACTION", source: "", text: "" };
  }

  const markerQuoted = " text: '";
  const markerPlain = " text: ";
  const markerTarget = " target: ";
  const idxQuoted = detail.indexOf(markerQuoted);
  const idxPlain = idxQuoted === -1 ? detail.indexOf(markerPlain) : -1;
  const idxTarget =
    idxQuoted === -1 && idxPlain === -1 ? detail.indexOf(markerTarget) : -1;
  const cutIdx =
    idxQuoted >= 0 ? idxQuoted : idxPlain >= 0 ? idxPlain : idxTarget;
  if (cutIdx === -1) {
    return { action: detail, source: "", text: "" };
  }

  const head = detail.slice(0, cutIdx).trim();
  const fromToken = " from ";
  const fromIdx = head.indexOf(fromToken);
  const action =
    (fromIdx === -1 ? head : head.slice(0, fromIdx)).trim() || "INTERACTION";
  const source = fromIdx === -1 ? "" : head.slice(fromIdx + fromToken.length).trim();

  let text = "";
  if (idxQuoted >= 0) {
    text = detail.slice(idxQuoted + markerQuoted.length);
    if (text.endsWith("'")) text = text.slice(0, -1);
  } else if (idxPlain >= 0) {
    text = detail.slice(idxPlain + markerPlain.length).trim();
  } else if (idxTarget >= 0) {
    text = detail.slice(idxTarget + markerTarget.length).trim();
  }

  return { action, source, text };
}
