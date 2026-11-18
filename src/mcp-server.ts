import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BrowserManager } from './browser-manager.js';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Create and configure the MCP server with all browser tools.
 */
export function createMcpServer(browserManager: BrowserManager): McpServer {
  const server = new McpServer({
    name: 'browser-remote-mcp',
    version: '1.0.0',
  });

  // Tool: browser_navigate - Navigate to a URL
  server.tool(
    'browser_navigate',
    'Navigate the browser to a specified URL',
    {
      url: z.string().url().describe('The URL to navigate to'),
    },
    async (args) => {
      const result = await browserManager.navigate(args.url);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Navigated to: ${result.url}\nPage title: ${result.title}`,
          },
        ],
      };
    }
  );

  // Tool: browser_screenshot - Take a screenshot
  server.tool(
    'browser_screenshot',
    'Take a screenshot of the current page and return it as base64 PNG',
    {
      fullPage: z.boolean().optional().describe('Whether to capture the full page or just the viewport'),
    },
    async (args) => {
      const base64 = await browserManager.screenshot(args.fullPage ?? false);
      const sizeKB = Math.round(base64.length * 3 / 4 / 1024);
      const scope = args.fullPage ? 'full page' : 'viewport';

      // Save to file for HTTP access via proxy /shots/ endpoint
      const shotsDir = join(process.cwd(), 'shots');
      try { mkdirSync(shotsDir, { recursive: true }); } catch {}
      const ts = Date.now().toString();
      const filename = `shot_${ts}.png`;
      const filepath = join(shotsDir, filename);
      writeFileSync(filepath, Buffer.from(base64, 'base64'));

      const baseUrl = process.env.SHOTS_BASE_URL || '';
      const url = baseUrl ? `${baseUrl}/shots/${filename}` : `/shots/${filename}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Screenshot saved: ${filename}\nSize: ${sizeKB}KB, ${scope}\nURL: ${url}`,
          },
          {
            type: 'image' as const,
            data: base64,
            mimeType: 'image/png',
          },
        ],
      };
    }
  );

  // Tool: browser_click - Click an element (multi-strategy)
  server.tool(
    'browser_click',
    'Click an element by CSS selector. Uses multi-strategy: native Playwright click -> force click -> JS click. force=true skips the native strategy. Returns which strategy succeeded.',
    {
      selector: z.string().describe('CSS selector of the element to click'),
      force: z.boolean().optional().describe('If true, skip native click and go straight to force/JS strategies (default: false)'),
      timeout: z.number().optional().describe('Maximum time to wait in milliseconds (default: 10000)'),
    },
    async (args) => {
      const strategy = await browserManager.click(args.selector, args.force ?? false, args.timeout ?? 10000);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Clicked element: ${args.selector} (strategy: ${strategy})`,
          },
        ],
      };
    }
  );

  // Tool: browser_type - Type text into an input
  server.tool(
    'browser_type',
    'Type text into an input element by CSS selector. Uses multi-strategy: native fill -> force fill -> JS value set. force=true skips native strategy.',
    {
      selector: z.string().describe('CSS selector of the input element'),
      text: z.string().describe('Text to type into the element'),
      force: z.boolean().optional().describe('If true, skip native fill and go straight to force/JS strategies (default: false)'),
      timeout: z.number().optional().describe('Maximum time to wait in milliseconds (default: 10000)'),
    },
    async (args) => {
      const strategy = await browserManager.type(args.selector, args.text, args.force ?? false, args.timeout ?? 10000);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Typed "${args.text}" into element: ${args.selector} (strategy: ${strategy})`,
          },
        ],
      };
    }
  );

  // Tool: browser_evaluate - Execute JavaScript
  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the page context and return the result',
    {
      script: z.string().describe('JavaScript code to execute in the page context'),
    },
    async (args) => {
      const result = await browserManager.evaluate(args.script);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // Tool: browser_get_content - Get page text content
  server.tool(
    'browser_get_content',
    'Get the visible text content of the current page',
    {},
    async () => {
      const text = await browserManager.getTextContent();
      return {
        content: [
          {
            type: 'text' as const,
            text,
          },
        ],
      };
    }
  );

  // Tool: browser_get_html - Get page HTML (cleaned)
  server.tool(
    'browser_get_html',
    'Get the HTML of the current page with style/script/comments stripped. Default max 30000 chars.',
    {
      maxLength: z.number().optional().describe('Max characters to return (default: 30000). Set 0 for no limit.'),
    },
    async (args) => {
      let html = await browserManager.getHtml();

      // 1. Strip <style>...</style>
      html = html.replace(/<style[\s\S]*?<\/style>/gi, '');
      // 2. Strip <script>...</script>
      html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      // 3. Strip HTML comments
      html = html.replace(/<!--[\s\S]*?-->/g, '');

      // 4. Truncate if over limit
      const max = args.maxLength ?? 30000;
      let text: string;
      if (max > 0 && html.length > max) {
        text = html.substring(0, max) + '\n\n[truncated: ' + (html.length - max) + ' chars omitted, total ' + html.length + ']';
      } else {
        text = html;
      }
      return {
        content: [
          {
            type: 'text' as const,
            text,
          },
        ],
      };
    }
  );

  // Tool: browser_close - Close the browser
  server.tool(
    'browser_close',
    'Close the browser and release all resources',
    {},
    async () => {
      await browserManager.close();
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Browser closed successfully.',
          },
        ],
      };
    }
  );

  // Tool: browser_list_tabs - List all open tabs
  server.tool(
    'browser_list_tabs',
    'List all open browser tabs with their URLs and titles',
    {},
    async () => {
      const tabs = await browserManager.listTabs();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(tabs, null, 2),
          },
        ],
      };
    }
  );

  // Tool: browser_wait_for - Wait for an element to appear
  server.tool(
    'browser_wait_for',
    'Wait for an element matching the CSS selector to appear on the page',
    {
      selector: z.string().describe('CSS selector of the element to wait for'),
      timeout: z.number().optional().describe('Maximum time to wait in milliseconds (default: 30000)'),
    },
    async (args) => {
      await browserManager.waitForSelector(args.selector, args.timeout ?? 30000);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Element appeared: ${args.selector}`,
          },
        ],
      };
    }
  );

  return server;
}

/**
 * Create a StreamableHTTP transport for the MCP server.
 *
 * MCP protocol 2026-07-28 removed protocol-level sessions,
 * so sessionIdGenerator is set to undefined (no session management).
 * This enables stateless operation over HTTPS — each POST is independent.
 */
export function createTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
}
