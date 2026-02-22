import React, { useMemo } from 'react';

const MAX_MARKDOWN_LENGTH = 20000;

const stripControlCharacters = (value) => {
  let cleaned = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    const isDisallowedControlChar =
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127;

    if (!isDisallowedControlChar) {
      cleaned += value[index];
    }
  }
  return cleaned;
};

const normalizeContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch (error) {
    return String(content);
  }
};

const sanitizeMarkdownInput = (content) => {
  const normalized = stripControlCharacters(normalizeContent(content));
  if (normalized.length <= MAX_MARKDOWN_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_MARKDOWN_LENGTH)}\n\n[content truncated for safety]`;
};

const isListItem = (line) => /^\s*[-*]\s+/.test(line);
const isNumberedListItem = (line) => /^\s*\d+\.\s+/.test(line);
const isBlockQuoteLine = (line) => /^\s*>\s?/.test(line);
const isHeadingLine = (line) => /^(#{1,6})\s+/.test(line);
const isCodeFenceLine = (line) => /^\s*```/.test(line);

const isParagraphBreak = (line) =>
  !line.trim() ||
  isListItem(line) ||
  isNumberedListItem(line) ||
  isBlockQuoteLine(line) ||
  isHeadingLine(line) ||
  isCodeFenceLine(line);

const parseBlocks = (markdownText) => {
  const lines = markdownText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isCodeFenceLine(line)) {
      const language = line.trim().slice(3).trim();
      index += 1;
      const codeLines = [];
      while (index < lines.length && !isCodeFenceLine(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && isCodeFenceLine(lines[index])) {
        index += 1;
      }
      blocks.push({ type: 'code', language, text: codeLines.join('\n') });
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2]
      });
      index += 1;
      continue;
    }

    if (isListItem(line)) {
      const items = [];
      while (index < lines.length && isListItem(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'unordered-list', items });
      continue;
    }

    if (isNumberedListItem(line)) {
      const items = [];
      while (index < lines.length && isNumberedListItem(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ''));
        index += 1;
      }
      blocks.push({ type: 'ordered-list', items });
      continue;
    }

    if (isBlockQuoteLine(line)) {
      const quoteLines = [];
      while (index < lines.length && isBlockQuoteLine(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'blockquote', text: quoteLines.join('\n') });
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && !isParagraphBreak(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n') });
  }

  return blocks;
};

const sanitizeLink = (candidateUrl) => {
  const url = (candidateUrl || '').trim();
  if (!url) return null;

  if (url.startsWith('/') || url.startsWith('#')) {
    return url;
  }
  if (/^https?:\/\/\S+$/i.test(url)) {
    return url;
  }
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url)) {
    return url;
  }
  return null;
};

const INLINE_TOKEN_REGEX = /(\[[^\]]+\]\([^)]+\)|`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;

const renderInline = (text, keyPrefix) => {
  const safeText = text || '';
  const nodes = [];
  const regex = new RegExp(INLINE_TOKEN_REGEX);
  let lastIndex = 0;
  let tokenIndex = 0;
  let match = regex.exec(safeText);

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(safeText.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-token-${tokenIndex}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(<code key={key} className="md-inline-code">{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const label = linkMatch ? linkMatch[1] : token;
      const url = linkMatch ? sanitizeLink(linkMatch[2]) : null;
      if (url) {
        nodes.push(
          <a key={key} href={url} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      } else {
        nodes.push(label);
      }
    } else {
      nodes.push(token);
    }

    lastIndex = regex.lastIndex;
    tokenIndex += 1;
    match = regex.exec(safeText);
  }

  if (lastIndex < safeText.length) {
    nodes.push(safeText.slice(lastIndex));
  }

  return nodes;
};

const renderTextWithLineBreaks = (text, keyPrefix) => {
  const lines = (text || '').split('\n');
  return lines.map((line, index) => (
    <React.Fragment key={`${keyPrefix}-line-${index}`}>
      {renderInline(line, `${keyPrefix}-line-${index}`)}
      {index < lines.length - 1 ? <br /> : null}
    </React.Fragment>
  ));
};

const SafeMarkdownMessage = ({ content }) => {
  const blocks = useMemo(() => {
    const safeText = sanitizeMarkdownInput(content);
    return parseBlocks(safeText);
  }, [content]);

  return (
    <div className="safe-markdown-message">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const headingLevel = Math.min(Math.max(block.level, 1), 6);
          const HeadingTag = `h${headingLevel}`;
          return (
            <HeadingTag key={`block-${index}`} className="md-heading">
              {renderInline(block.text, `block-${index}`)}
            </HeadingTag>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul key={`block-${index}`} className="md-list">
              {block.items.map((item, itemIndex) => (
                <li key={`block-${index}-item-${itemIndex}`}>
                  {renderInline(item, `block-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol key={`block-${index}`} className="md-list">
              {block.items.map((item, itemIndex) => (
                <li key={`block-${index}-item-${itemIndex}`}>
                  {renderInline(item, `block-${index}-item-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote key={`block-${index}`} className="md-blockquote">
              {renderTextWithLineBreaks(block.text, `block-${index}`)}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={`block-${index}`} className="md-code-block">
              <code>{block.text}</code>
            </pre>
          );
        }

        return (
          <p key={`block-${index}`} className="md-paragraph">
            {renderTextWithLineBreaks(block.text, `block-${index}`)}
          </p>
        );
      })}
    </div>
  );
};

export default SafeMarkdownMessage;
