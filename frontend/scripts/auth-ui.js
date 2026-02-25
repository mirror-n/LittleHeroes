/**
 * Auth UI Manager for Little Heroes
 * 네비게이션 바에 로그인/프로필 상태를 표시하고 관리합니다.
 */
import { auth, isFirebaseConfigured, onAuthStateChanged, logout, getActiveChildProfile } from './firebase-config.js';

// 아바타 목록 (자녀 프로필용)
const AVATARS = ['🦁', '🐻', '🐰', '🦊', '🐼', '🐨', '🦄', '🐱', '🐶', '🦋', '🌟', '🎨'];

class AuthUI {
  constructor() {
    this.user = null;
    this.initialized = false;
    this.init();
  }

  init() {
    // Firebase 미설정 시 데모 모드로 동작
    if (!isFirebaseConfigured()) {
      this.createAuthButton(null);
      this.initialized = true;
      return;
    }

    // Firebase 인증 상태 감시
    onAuthStateChanged(auth, (user) => {
      this.user = user;
      this.createAuthButton(user);
      this.initialized = true;
    });
  }

  /**
   * 네비게이션 바에 인증 버튼/프로필 아이콘 생성
   */
  createAuthButton(user) {
    const nav = document.querySelector('.navigation');
    if (!nav) return;

    // 기존 logo-icon을 auth 영역으로 교체
    const existingLogo = nav.querySelector('.logo-icon');
    const existingAuth = nav.querySelector('.auth-area');
    
    if (existingAuth) existingAuth.remove();

    const authArea = document.createElement('div');
    authArea.className = 'auth-area';

    if (user) {
      // 로그인 상태: 자녀 프로필 또는 부모 아이콘 표시
      const childProfile = getActiveChildProfile();
      
      if (childProfile) {
        // 자녀 프로필 활성화 상태
        authArea.innerHTML = `
          <div class="auth-profile-btn" id="authProfileBtn" title="${childProfile.nickname}">
            <span class="auth-avatar">${AVATARS[childProfile.avatarIndex] || '🌟'}</span>
          </div>
        `;
      } else {
        // 부모 로그인만 된 상태
        authArea.innerHTML = `
          <div class="auth-profile-btn" id="authProfileBtn" title="${user.displayName || user.email}">
            <span class="auth-avatar">👤</span>
          </div>
        `;
      }

      authArea.querySelector('#authProfileBtn').addEventListener('click', () => {
        this.showProfileMenu(user);
      });
    } else {
      // 비로그인 상태: 로그인 버튼
      const lang = localStorage.getItem('littleHeroesLanguage') || 'en';
      const loginText = lang === 'ko' ? '로그인' : 'Log in';
      authArea.innerHTML = `
        <a href="login.html" class="auth-login-btn" data-ko="로그인" data-en="Log in">${loginText}</a>
      `;
    }

    // logo-icon 위치에 삽입
    if (existingLogo) {
      existingLogo.parentNode.replaceChild(authArea, existingLogo);
    } else {
      nav.appendChild(authArea);
    }
  }

  /**
   * 프로필 드롭다운 메뉴 표시
   */
  showProfileMenu(user) {
    // 기존 메뉴 제거
    const existingMenu = document.querySelector('.auth-dropdown-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const lang = localStorage.getItem('littleHeroesLanguage') || 'en';
    const childProfile = getActiveChildProfile();

    const menu = document.createElement('div');
    menu.className = 'auth-dropdown-menu';
    
    const childName = childProfile ? childProfile.nickname : '';
    const parentName = user.displayName || user.email;

    menu.innerHTML = `
      <div class="auth-menu-header">
        <div class="auth-menu-name">${childName || parentName}</div>
        <div class="auth-menu-email">${user.email}</div>
      </div>
      <div class="auth-menu-divider"></div>
      ${childProfile ? `
        <a href="select-profile.html" class="auth-menu-item" data-ko="프로필 전환" data-en="Switch Profile">
          ${lang === 'ko' ? '프로필 전환' : 'Switch Profile'}
        </a>
      ` : ''}
      <a href="parent-dashboard.html" class="auth-menu-item" data-ko="부모 대시보드" data-en="Parent Dashboard">
        ${lang === 'ko' ? '부모 대시보드' : 'Parent Dashboard'}
      </a>
      <div class="auth-menu-divider"></div>
      <button class="auth-menu-item auth-menu-logout" id="logoutBtn" data-ko="로그아웃" data-en="Log out">
        ${lang === 'ko' ? '로그아웃' : 'Log out'}
      </button>
    `;

    document.body.appendChild(menu);

    // 위치 조정
    const btn = document.querySelector('#authProfileBtn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      menu.style.top = (rect.bottom + 8) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
    }

    // 로그아웃 버튼
    menu.querySelector('#logoutBtn').addEventListener('click', async () => {
      if (isFirebaseConfigured()) {
        await logout();
      }
      menu.remove();
      window.location.href = 'home.html';
    });

    // 외부 클릭 시 메뉴 닫기
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && !e.target.closest('#authProfileBtn')) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 100);
  }
}

// 아바타 목록 export
export { AVATARS };

// DOM 준비 후 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.authUI = new AuthUI();
  });
} else {
  window.authUI = new AuthUI();
}
