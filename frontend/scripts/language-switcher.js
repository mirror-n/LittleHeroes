/**
 * Global Language Switcher for Little Heroes
 * Manages language selection across all pages using localStorage
 */

class LanguageSwitcher {
  constructor() {
    this.currentLanguage = this.getStoredLanguage() || 'en';
    this.init();
  }

  init() {
    this.createLanguageToggle();
    this.applyLanguage(this.currentLanguage);
    this.setupEventListeners();
  }

  /**
   * Create language toggle buttons in the navigation header
   */
  createLanguageToggle() {
    const nav = document.querySelector('.navigation');
    if (!nav) return;

    // Remove any existing toggle to prevent duplicates
    const existing = nav.querySelector('.language-toggle-global');
    if (existing) existing.remove();

    // Create language toggle container
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'language-toggle-global';
    toggleContainer.innerHTML = `
      <button class="lang-btn-global" data-lang="ko">한국어</button>
      <button class="lang-btn-global" data-lang="en">English</button>
    `;

    // Insert before logo-icon
    const logoIcon = nav.querySelector('.logo-icon');
    if (logoIcon) {
      logoIcon.parentNode.insertBefore(toggleContainer, logoIcon);
    } else {
      nav.appendChild(toggleContainer);
    }

    // Set active button
    this.updateActiveButton();
  }

  /**
   * Setup event listeners for language buttons
   */
  setupEventListeners() {
    const buttons = document.querySelectorAll('.lang-btn-global');
    buttons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const lang = e.target.dataset.lang;
        this.setLanguage(lang);
      });
    });
  }

  /**
   * Set language and update all content
   */
  setLanguage(lang) {
    if (lang !== 'ko' && lang !== 'en') return;

    this.currentLanguage = lang;
    localStorage.setItem('littleHeroesLanguage', lang);
    this.updateActiveButton();
    this.applyLanguage(lang);

    // Dispatch custom event for page-specific language changes (e.g., chat page)
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
  }

  /**
   * Apply language to all elements with data-ko and data-en attributes
   */
  applyLanguage(lang) {
    // Update text content for elements with data-ko/data-en
    const elements = document.querySelectorAll('[data-ko][data-en]');
    elements.forEach((el) => {
      const text = lang === 'ko' ? el.dataset.ko : el.dataset.en;
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search')) {
        el.placeholder = text;
      } else if (el.tagName === 'IMG') {
        el.alt = text;
      } else {
        el.textContent = text;
      }
    });

    // Update innerHTML for elements with data-ko-html/data-en-html (for elements with child tags)
    const htmlElements = document.querySelectorAll('[data-ko-html][data-en-html]');
    htmlElements.forEach((el) => {
      el.innerHTML = lang === 'ko' ? el.dataset.koHtml : el.dataset.enHtml;
    });

    // Show/hide language-specific sections
    document.querySelectorAll('[data-lang-show]').forEach((el) => {
      el.style.display = el.dataset.langShow === lang ? '' : 'none';
    });

    // Update page title if data attributes exist
    const pageTitle = document.querySelector('[data-page-title-ko][data-page-title-en]');
    if (pageTitle) {
      document.title = lang === 'ko' ? pageTitle.dataset.pageTitleKo : pageTitle.dataset.pageTitleEn;
    }
  }

  /**
   * Update active button styling
   */
  updateActiveButton() {
    const buttons = document.querySelectorAll('.lang-btn-global');
    buttons.forEach((btn) => {
      if (btn.dataset.lang === this.currentLanguage) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Get stored language from localStorage
   */
  getStoredLanguage() {
    return localStorage.getItem('littleHeroesLanguage');
  }

  /**
   * Get current language
   */
  getCurrentLanguage() {
    return this.currentLanguage;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.languageSwitcher = new LanguageSwitcher();
  });
} else {
  window.languageSwitcher = new LanguageSwitcher();
}
