import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    if (m[2] !== undefined) {
      parts.push(<strong key={key++} className="font-semibold text-white/80">{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-white/10 font-mono text-[10px] text-white/70">
          {m[3]}
        </code>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

export function RenderMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const h3 = line.match(/^###\s+(.*)/);
    if (h3) {
      elements.push(
        <p key={key++} className="text-[11px] font-semibold text-white/80 uppercase tracking-wider mt-2 mb-0.5">
          {renderInline(h3[1])}
        </p>
      );
      i++;
      continue;
    }

    const h2 = line.match(/^##\s+(.*)/);
    if (h2) {
      elements.push(
        <p key={key++} className="text-xs font-semibold text-white/85 mt-2 mb-0.5">
          {renderInline(h2[1])}
        </p>
      );
      i++;
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    if (h1) {
      elements.push(
        <p key={key++} className="text-xs font-bold text-white/90 mt-2 mb-0.5">
          {renderInline(h1[1])}
        </p>
      );
      i++;
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i])) {
        const content = lines[i].replace(/^[-*]\s+/, '');
        items.push(
          <li key={i} className="flex gap-1.5">
            <span className="text-white/30 mt-px shrink-0">•</span>
            <span>{renderInline(content)}</span>
          </li>
        );
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-0.5">
          {items}
        </ul>
      );
      continue;
    }

    elements.push(
      <p key={key++} className="leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return (
    <div className="text-xs text-white/60 space-y-1">
      {elements}
    </div>
  );
}
