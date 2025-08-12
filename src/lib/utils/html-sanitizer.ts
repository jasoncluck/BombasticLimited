/**
 * Simple HTML sanitizer for notification content
 * Allows only safe tags: <b>, <i>, <u>, <br>, <a href="...">
 * Removes all other HTML tags and attributes for security
 */

const ALLOWED_TAGS = ['b', 'i', 'u', 'br', 'a'] as const;
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href'],
};

export function sanitizeNotificationHtml(html: string): string {
  if (!html) return '';

  // Create a temporary element to parse HTML safely
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.querySelector('div');

  if (!container) return '';

  // Function to sanitize a single node
  function sanitizeNode(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) {
      // Text nodes are safe as-is
      return node.cloneNode(true);
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();

      // Only allow whitelisted tags
      if (!ALLOWED_TAGS.includes(tagName as any)) {
        // For disallowed tags, just return their text content
        const textNode = document.createTextNode(element.textContent || '');
        return textNode;
      }

      // Create new safe element
      const newElement = document.createElement(tagName);

      // Only allow whitelisted attributes
      const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || [];
      for (const attrName of allowedAttrs) {
        const attrValue = element.getAttribute(attrName);
        if (attrValue) {
          // Special handling for href to prevent javascript: and other dangerous schemes
          if (attrName === 'href') {
            if (
              attrValue.startsWith('http://') ||
              attrValue.startsWith('https://') ||
              attrValue.startsWith('/') ||
              attrValue.startsWith('#')
            ) {
              newElement.setAttribute(attrName, attrValue);
            }
          } else {
            newElement.setAttribute(attrName, attrValue);
          }
        }
      }

      // Recursively sanitize child nodes
      for (const child of Array.from(element.childNodes)) {
        const sanitizedChild = sanitizeNode(child);
        if (sanitizedChild) {
          newElement.appendChild(sanitizedChild);
        }
      }

      return newElement;
    }

    // Skip other node types
    return null;
  }

  // Sanitize all child nodes
  const sanitizedContainer = document.createElement('div');
  for (const child of Array.from(container.childNodes)) {
    const sanitizedChild = sanitizeNode(child);
    if (sanitizedChild) {
      sanitizedContainer.appendChild(sanitizedChild);
    }
  }

  return sanitizedContainer.innerHTML;
}

/**
 * Browser-compatible version that works in Svelte components
 * Returns a safe HTML string that can be used with {@html}
 */
export function createSafeHtml(html: string): string {
  return sanitizeNotificationHtml(html);
}
