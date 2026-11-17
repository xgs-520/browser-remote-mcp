import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { BrowserManager } from './browser-manager.js';
import { randomUUID } from 'node:crypto';

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
      url: {
        type: 'string',
        format: 'uri',
        description: 'The URL to navigate to',
      },
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
      fullPage: {
        type: 'boolean',
        description: 'Whether to capture the full page or just the viewport',
      },
    },
    async (args) => {
      const base64 = await browserManager.screenshot(args.fullPage ?? false);
      return {
        content: [
          {
            type: 'image' as const,
            data: base64,
            mimeType: 'image/png',
          },
        ],
      };
    }
  );

  // Tool: browser_click - Click an element
  server.tool(
    'browser_click',
    'Click an element on the page by CSS selector',
    {
      selector: {
        type: 'string',
        description: 'CSS selector of the element to click',
      },
    },
    async (args) => {
      await browserManager.click(args.selector);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Clicked element: ${args.selector}`,
          },
        ],
      };
    }
  );

  // Tool: browser_type - Type text into an input
  server.tool(
    'browser_type',
    'Type text into an input element identified by CSS selector',
    {
      selector: {
        type: 'string',
        description: 'CSS selector of the input element',
      },
      text: {
        type: 'string',
        description: 'Text to type into the element',
      },
    },
    async (args) => {
      await browserManager.type(args.selector, args.text);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Typed "${args.text}" into element: ${args.selector}`,
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
      script: {
        type: 'string',
        description: 'JavaScript code to execute in the page context',
      },
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

  // Tool: browser_get_html - Get page HTML
  server.tool(
    'browser_get_html',
    'Get the full HTML of the current page',
    {},
    async () => {
      const html = await browserManager.getHtml();
      return {
        content: [
          {
            type: 'text' as const,
            text: html,
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
      selector: {
        type: 'string',
        description: 'CSS selector of the element to wait for',
      },
      timeout: {
        type: 'number',
        description: 'Maximum time to wait in milliseconds (default: 30000)',
      },
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
 */
export function createTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
}
