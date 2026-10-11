// Replace the text between <!-- name:start --> and <!-- name:end -->, or
// append the block if the markers are not there yet.
export function upsertBlock(text, name, body) {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const block = `${start}\n${body.trim()}\n${end}`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from !== -1 && to > from) {
    return text.slice(0, from) + block + text.slice(to + end.length);
  }
  const sep = text === "" ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return `${text}${sep}${block}\n`;
}
