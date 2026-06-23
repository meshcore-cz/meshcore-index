// Lightweight inline-markdown + Obsidian-style wikilink parser.
//
// Description fields are authored by maintainers in YAML (trusted content), but
// we still tokenise into a small node tree rather than emit HTML — so the
// renderer (RichText.svelte) can use real SvelteKit <a> links and never needs
// {@html}/manual escaping.
//
// Supported syntax:
//   **bold**            → strong
//   *italic*            → em
//   `code`              → inline code
//   [text](https://…)   → external link
//   [[type:id]]         → internal wikilink, label = entity name
//   [[type:id|Label]]   → internal wikilink with custom visible label
//
// Underscore emphasis (`_x_`) is intentionally NOT supported so snake_case ids
// (e.g. xiao_nrf52) in plain prose are never mangled.

// Order matters: longer/greedier delimiters (** before *) come first so the
// leftmost match at a given position picks the right token.
const INLINE =
  /\[\[([^\]]+?)\]\]|\[([^\]]+?)\]\(([^()\s]+)\)|`([^`]+?)`|\*\*([\s\S]+?)\*\*|\*([^\s*][\s\S]*?)\*/;

/** Split `target|label` on the first pipe; label may be omitted. */
function splitPipe(raw) {
  const i = raw.indexOf('|');
  if (i === -1) return [raw.trim(), null];
  return [raw.slice(0, i).trim(), raw.slice(i + 1).trim() || null];
}

/** Parse a single line of text into an array of inline nodes. */
function parseInline(str) {
  const nodes = [];
  let rest = str;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      nodes.push({ type: 'text', value: rest });
      break;
    }
    if (m.index > 0) nodes.push({ type: 'text', value: rest.slice(0, m.index) });

    if (m[1] !== undefined) {
      const [target, label] = splitPipe(m[1]);
      nodes.push({ type: 'wikilink', target, label });
    } else if (m[2] !== undefined) {
      nodes.push({ type: 'link', href: m[3], children: parseInline(m[2]) });
    } else if (m[4] !== undefined) {
      nodes.push({ type: 'code', value: m[4] });
    } else if (m[5] !== undefined) {
      nodes.push({ type: 'strong', children: parseInline(m[5]) });
    } else {
      nodes.push({ type: 'em', children: parseInline(m[6]) });
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}

/** Join consecutive lines of a paragraph with soft-break nodes. */
function linesToInline(lines) {
  const out = [];
  lines.forEach((line, i) => {
    if (i) out.push({ type: 'br' });
    out.push(...parseInline(line));
  });
  return out;
}

/**
 * Parse rich text into a flat list of block nodes:
 *   { type: 'p',  children: InlineNode[] }
 *   { type: 'ul', items: InlineNode[][] }
 *
 * Blocks are separated by blank lines; `- ` / `* ` lines form a list.
 */
export function parseRichText(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');

  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'p', children: linesToInline(para) });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(list);
      list = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    const li = trimmed.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      if (!list) list = { type: 'ul', items: [] };
      list.items.push(parseInline(li[1]));
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return blocks;
}

/**
 * Flatten rich text to a single plain-text line (for SEO meta, card clamps,
 * etc.) — strips all formatting and unwraps links to their text.
 *
 * @param {string} text
 * @param {(target: string, label: string|null) => string} [resolveLink]
 *   Maps a wikilink to its display text. Defaults to the label, else the id
 *   portion of `type:id`. Pass a resolver that looks up entity names for nicer
 *   output.
 */
export function richTextToPlain(text, resolveLink) {
  const linkText = resolveLink || ((target, label) => label || target.replace(/^[^:]+:/, ''));
  const inline = (nodes) =>
    nodes
      .map((n) => {
        switch (n.type) {
          case 'text':
          case 'code':
            return n.value;
          case 'br':
            return ' ';
          case 'strong':
          case 'em':
          case 'link':
            return inline(n.children);
          case 'wikilink':
            return linkText(n.target, n.label);
          default:
            return '';
        }
      })
      .join('');
  return parseRichText(text)
    .map((b) => (b.type === 'ul' ? b.items.map(inline).join(' ') : inline(b.children)))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
