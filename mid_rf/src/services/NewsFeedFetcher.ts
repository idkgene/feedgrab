import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { Browser, Page } from 'puppeteer'
import { NewsItem } from '../interfaces/NewsItem'
import logger from '../config/logger'

puppeteer.use(StealthPlugin())

export class NewsFeedFetcher {
  private browser: Browser | null = null
  private page: Page | null = null

  async initialize(): Promise<void> {
    try {
      const browserOptions: any = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      }

      this.browser = await puppeteer.launch(browserOptions)
      this.page = await this.browser.newPage()

      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      )

      await this.page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      })
      logger.info('Browser initialized successfully')
    } catch (error) {
      logger.error('Failed to initialize browser:', error)
      throw new Error('Browser initialization failed')
    }
  }

  async getContent(pageNumber: number = 1): Promise<NewsItem[]> {
    if (!this.page) throw new Error('Browser not initialized')

    try {
      const url =
        pageNumber === 1
          ? 'https://mid.ru/ru/foreign_policy/news/'
          : `https://mid.ru/ru/foreign_policy/news/?PAGEN_1=${pageNumber}`

      logger.info(`Fetching page ${pageNumber}...`)
      await this.page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })

      await this.page
        .waitForSelector('.announce.announce_articles', { timeout: 10000 })
        .catch(() => {
          logger.warn('Timeout waiting for .announce.announce_articles')
        })

      const pageContent = await this.page.content()
      if (pageContent.includes('Data processing... Please, wait.')) {
        logger.info('Anti-bot protection detected. Waiting for page to load...')
        await this.page
          .waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 })
          .catch(() => logger.warn('Timeout waiting for navigation'))
      }

      const newsItems = await this.page.evaluate(() => {
        const items: NewsItem[] = []
        const announceList = document.querySelector(
          '.announce.announce_articles',
        )
        if (!announceList) return items

        const announceItems = announceList.querySelectorAll('.announce__item')

        announceItems.forEach((item) => {
          const dateElement = item.querySelector('.announce__date')
          const timeElement = item.querySelector('.announce__time')
          const linkElement = item.querySelector(
            '.announce__link',
          ) as HTMLAnchorElement
          const tagsElement = item.querySelector('.announce__meta-tags')

          if (dateElement && timeElement && linkElement) {
            items.push({
              date: dateElement.textContent?.trim() || '',
              time: timeElement.textContent?.trim() || '',
              title: linkElement.textContent?.trim() || '',
              link: linkElement.href,
              tags: tagsElement
                ? tagsElement.textContent?.trim().split(', ') || []
                : [],
            })
          }
        })

        return items
      })

      logger.info(`Found ${newsItems.length} news items on page ${pageNumber}`)
      return newsItems
    } catch (error) {
      logger.error(`Error fetching content from page ${pageNumber}:`, error)
      throw new Error(`Failed to fetch content from page ${pageNumber}`)
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      logger.info('Browser closed')
    }
  }
}
