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
   * Click an element by CSS selector.
   */
  async click(selector: string): Promise<void> {
    const page = this.getCurrentPage();
    await page.click(selector, { timeout: 10000 });
  }

  /**
   * Type text into an element identified by CSS selector.
   */
  async type(selector: string, text: string): Promise<void> {
    const page = this.getCurrentPage();
    await page.fill(selector, text, { timeout: 10000 });
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
