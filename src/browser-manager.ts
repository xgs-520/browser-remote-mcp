import { chromium, Browser, BrowserContext, Page } from 'playwright';

export interface TabInfo {
  index: number;
  url: string;
  title: string;
}

/**
 * Manages a Playwright browser instance and its pages/tabs.
 * Provides methods for navigation, interaction, and information retrieval.
 */
export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Page[] = [];
  private currentPageIndex: number = 0;

  /**
   * Launch the browser if not already running.
   */
  async ensureBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
      });
      const page = await this.context.newPage();
      this.pages.push(page);
      this.currentPageIndex = 0;
    }
  }

  /**
   * Get the current active page.
   */
  getCurrentPage(): Page {
    if (this.pages.length === 0) {
      throw new Error('No browser page available. Call browser_navigate first.');
    }
    return this.pages[this.currentPageIndex];
  }

  /**
   * Navigate to a URL.
   */
  async navigate(url: string): Promise<{ title: string; url: string }> {
    await this.ensureBrowser();
    const page = this.getCurrentPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const title = await page.title();
    return { title, url: page.url() };
  }

  /**
   * Take a screenshot of the current page.
   */
  async screenshot(fullPage: boolean = false): Promise<string> {
    const page = this.getCurrentPage();
    const buffer = await page.screenshot({ fullPage, type: 'png' });
    return buffer.toString('base64');
  }

  /**
   * Click an element by CSS selector using multi-strategy approach.
   *
   * Strategy order (first success wins):
   *   1. Playwright native click  — isTrusted=true, requires visibility
   *   2. Playwright force click   — isTrusted=true, skips visibility, needs bounding box
   *   3. JS dispatchEvent click   — isTrusted=false, fallback for hidden/zero-size elements
   *
   * force=true skips strategy 1 and goes straight to 2→3.
   */
  async click(selector: string, force: boolean = false, timeout: number = 10000): Promise<string> {
    const page = this.getCurrentPage();
    const errors: string[] = [];

    // Strategy 1: Native Playwright click (isTrusted=true, respects visibility)
    if (!force) {
      try {
        await page.click(selector, { timeout });
        return 'native';
      } catch (e) {
        errors.push(`native: ${(e as Error).message.split('\n')[0]}`);
      }
    }

    // Strategy 2: Playwright force click (isTrusted=true, skips actionability)
    try {
      await page.click(selector, { force: true, timeout: 5000 });
      return 'force';
    } catch (e) {
      errors.push(`force: ${(e as Error).message.split('\n')[0]}`);
    }

    // Strategy 3: JS click — dispatch full PointerEvent sequence (isTrusted=false)
    try {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`Element not found: ${sel}`);
        // Scroll into view first
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        // Dispatch pointer + mouse + click events for max compatibility
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy };
        el.dispatchEvent(new PointerEvent('pointerdown', opts));
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new PointerEvent('pointerup', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
      }, selector);
      return 'js';
    } catch (e) {
      errors.push(`js: ${(e as Error).message.split('\n')[0]}`);
    }

    throw new Error(`All click strategies failed:\n  ${errors.join('\n  ')}`);
  }

  /**
   * Type text into an element identified by CSS selector.
   * force=true uses JS to set value + dispatch events.
   */
  async type(selector: string, text: string, force: boolean = false, timeout: number = 10000): Promise<string> {
    const page = this.getCurrentPage();

    if (!force) {
      try {
        await page.fill(selector, text, { timeout });
        return 'native';
      } catch {
        // fall through to force
      }
    }

    // Force: try Playwright fill with force, then JS fallback
    try {
      await page.fill(selector, text, { force: true, timeout: 5000 });
      return 'force';
    } catch {
      // fall through to JS
    }

    // JS fallback: set value + dispatch input/change events
    await page.evaluate(({ sel, val }) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (!el) throw new Error(`Element not found: ${sel}`);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { sel: selector, val: text });
    return 'js';
  }

  /**
   * Execute JavaScript in the page context and return the result.
   */
  async evaluate(script: string): Promise<unknown> {
    const page = this.getCurrentPage();
    return await page.evaluate(script);
  }

  /**
   * Get the text content of the page.
   */
  async getContent(): Promise<string> {
    const page = this.getCurrentPage();
    return await page.content();
  }

  /**
   * Get the full HTML of the page.
   */
  async getHtml(): Promise<string> {
    const page = this.getCurrentPage();
    const html = await page.content();
    return html;
  }

  /**
   * Get the visible text content of the page.
   */
  async getTextContent(): Promise<string> {
    const page = this.getCurrentPage();
    const text = await page.innerText('body');
    return text;
  }

  /**
   * Wait for an element to appear on the page.
   */
  async waitForSelector(selector: string, timeout: number = 30000): Promise<void> {
    const page = this.getCurrentPage();
    await page.waitForSelector(selector, { timeout });
  }

  /**
   * List all open tabs.
   */
  async listTabs(): Promise<TabInfo[]> {
    const tabs: TabInfo[] = [];
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      tabs.push({
        index: i,
        url: page.url(),
        title: await page.title().catch(() => ''),
      });
    }
    return tabs;
  }

  /**
   * Close the browser and clean up.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.pages = [];
      this.currentPageIndex = 0;
    }
  }
}
