/**
 * Citation processing utilities
 */

/**
 * Processes plain text bracket citations (e.g., "[1, 2]") in a DOM document.
 * This converts matched text citations into DOM placeholder elements that can be
 * later converted to footnotes by Turndown.
 * 
 * Crucially, this implements a NodeFilter that ignores text nodes inside CODE or PRE 
 * elements to prevent inadvertently turning code arrays (like `my_arr = [1, 2]`) into footnotes.
 *
 * @param doc The DOM document containing the nodes to process
 * @param messageIndex The current message index (for footnote prefixing)
 * @param resolveValidTitle A callback to validate a citation number and return its title. 
 *                          If it returns null/undefined, the number is considered an invalid citation.
 * @param footnoteByNumber A Map to populate with the discovered footnote definitions
 * @param order An array to populate with the ordered sequence of discovered footnote numbers
 */
export function processPlainTextCitations(
  doc: Document,
  messageIndex: number,
  resolveValidTitle: (num: number) => string | null | undefined,
  footnoteByNumber?: Map<string, string>,
  order?: string[]
): void {
  const PLAIN_CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

  // Create a TreeWalker that explicitly rejects CODE and PRE blocks
  const walk = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function(node) {
      let parent = node.parentElement;
      while (parent) {
        if (parent.tagName === 'CODE' || parent.tagName === 'PRE') {
          return NodeFilter.FILTER_REJECT; // Do not process text inside code blocks
        }
        parent = parent.parentElement;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes: Text[] = [];
  let textNode: Node | null;
  while ((textNode = walk.nextNode())) {
    textNodes.push(textNode as Text);
  }

  for (const node of textNodes) {
    if (!node.nodeValue) continue;
    
    // We only process if it matches the pattern
    if (!PLAIN_CITATION_PATTERN.test(node.nodeValue)) continue;
    PLAIN_CITATION_PATTERN.lastIndex = 0; // reset

    const fragment = doc.createDocumentFragment();
    let lastIndex = 0;
    let match;

    while ((match = PLAIN_CITATION_PATTERN.exec(node.nodeValue)) !== null) {
      // Append text before the match
      if (match.index > lastIndex) {
        fragment.appendChild(doc.createTextNode(node.nodeValue.substring(lastIndex, match.index)));
      }

      // Process the numbers inside the brackets, e.g., "1, 2"
      const numbers = match[1].split(',').map(s => s.trim());
      
      const hasAnyValidSource = numbers.some(numStr => {
        const num = parseInt(numStr, 10);
        return !isNaN(num) && resolveValidTitle(num) != null;
      });

      if (!hasAnyValidSource) {
        // If NONE of the numbers match a known source, it's likely just a regular text array like "[5, 6]".
        // We must preserve the exact original text including brackets!
        fragment.appendChild(doc.createTextNode(match[0]));
      } else {
        // If at least one is valid, we convert the valid ones to placeholders,
        // and leave the invalid ones as plain text. 
        numbers.forEach((numStr, idx) => {
          if (idx > 0) {
            fragment.appendChild(doc.createTextNode(', '));
          }

          const num = parseInt(numStr, 10);
          const title = !isNaN(num) ? resolveValidTitle(num) : null;
          
          if (title != null) {
            const label = `m${messageIndex}-${numStr}`;
            const placeholder = doc.createElement('span');
            placeholder.setAttribute('data-footnote-ref', label);
            placeholder.textContent = 'REF';
            fragment.appendChild(placeholder);

            if (footnoteByNumber && order && !footnoteByNumber.has(numStr)) {
              footnoteByNumber.set(numStr, title);
              order.push(numStr);
            }
          } else {
            // Mixed case: output the invalid number as text
            fragment.appendChild(doc.createTextNode(numStr));
          }
        });
      }

      lastIndex = PLAIN_CITATION_PATTERN.lastIndex;
    }

    // Append remaining text
    if (lastIndex < node.nodeValue.length) {
      fragment.appendChild(doc.createTextNode(node.nodeValue.substring(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  }
}
