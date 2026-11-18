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
   *   1. Native Playwright click     — isTrusted=true, respects visibility
   *   2. href extraction + navigate  — for <a> links, bypasses all click/hit-test issues
   *   3. Hide-overlay + force click  — isTrusted=true, removes occluders then clicks
   *   4. JS dispatchEvent click      — isTrusted=false, direct dispatch bypasses hit-testing
   *
   * force=true skips strategy 1.
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

    // Strategy 2: href extraction + direct navigation
    // For <a> tags, this is the most reliable — no click event needed, just go to the URL.
    // Also handles cases where click succeeds but navigation is blocked by overlays/JS routing.
    try {
      const href = await page.$eval(selector, (el) => {
        const anchor = el as HTMLAnchorElement;
        return anchor.href || null;
      }, selector).catch(() => null);

      if (href) {
        await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return 'href';
      }
    } catch (e) {
      errors.push(`href: ${(e as Error).message.split('\n')[0]}`);
    }

    // Strategy 3: Hide occluding elements + Playwright force click (isTrusted=true)
    try {
      const overlayInfo = await page.evaluate((sel) => {
        const target = document.querySelector(sel);
        if (!target) throw new Error(`Element not found: ${sel}`);
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return { hidden: 0, reason: 'zero-size' };
        }

        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const hidden: HTMLElement[] = [];

        const stack = document.elementsFromPoint(cx, cy);
        for (const el of stack) {
          if (el === target || target.contains(el) || el.contains(target)) continue;
          const style = getComputedStyle(el);
          const isOverlay =
            el.tagName === 'IFRAME' ||
            style.position === 'fixed' ||
            style.position === 'absolute' ||
            style.zIndex !== 'auto';
          if (isOverlay && style.display !== 'none' && style.visibility !== 'hidden') {
            (el as HTMLElement).style.setProperty('display', 'none', 'important');
            hidden.push(el as HTMLElement);
          }
        }

        target.scrollIntoView({ block: 'center', behavior: 'instant' });
        return { hidden: hidden.length, reason: hidden.length > 0 ? 'overlays-removed' : 'no-overlays' };
      }, selector);

      await page.click(selector, { force: true, timeout: 5000 });
      return `force${overlayInfo.hidden > 0 ? `+hide(${overlayInfo.hidden})` : ''}`;
    } catch (e) {
      errors.push(`force+hide: ${(e as Error).message.split('\n')[0]}`);
    }

    // Strategy 4: JS click — dispatch full pointer event sequence directly on element
    // Bypasses browser hit-testing entirely (isTrusted=false)
    try {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`Element not found: ${sel}`);
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
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
   * Multi-strategy: native fill → force fill → JS value set.
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

    try {
      await page.fill(selector, text, { force: true, timeout: 5000 });
      return 'force';
    } catch {
      // fall through to JS
    }

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
