# Firebase 설정 가이드

이 가이드는 Little Heroes 웹사이트에 Firebase 인증 및 데이터베이스 기능을 활성화하는 방법을 안내합니다. 아래 단계를 따라 Firebase 프로젝트를 설정하고 웹사이트 코드에 연동하세요.

## 1단계: Firebase 프로젝트 생성

1.  **Firebase Console 접속**: [https://console.firebase.google.com/](https://console.firebase.google.com/) 에 Google 계정(Mirror-N)으로 로그인합니다.
2.  **프로젝트 추가**: "프로젝트 추가" 버튼을 클릭합니다.
3.  **프로젝트 이름 입력**: `little-heroes-webapp` 과 같이 원하는 프로젝트 이름을 입력하고 계속 진행합니다.
4.  **Google 애널리틱스**: 이 프로젝트에서 Google 애널리틱스 사용 설정 옵션을 비활성화하고 "프로젝트 만들기"를 클릭합니다. (필요 시 나중에 추가 가능)
5.  프로젝트 생성이 완료될 때까지 기다립니다.

## 2단계: 웹 앱에 Firebase 추가

1.  프로젝트 대시보드에서 웹 아이콘(**</>**)을 클릭하여 웹 앱을 추가합니다.
2.  **앱 닉네임 등록**: "Little Heroes"와 같이 앱의 닉네임을 입력합니다.
3.  "Firebase 호스팅 설정" 옵션은 체크하지 않고 "앱 등록"을 클릭합니다.
4.  **Firebase SDK 추가** 단계에서 `firebaseConfig` 객체가 표시됩니다. 이 객체 안의 값들을 복사해야 합니다. 아래와 같은 형식입니다.

    ```javascript
    const firebaseConfig = {
      apiKey: "AIzaSy...",
      authDomain: "little-heroes-webapp.firebaseapp.com",
      projectId: "little-heroes-webapp",
      storageBucket: "little-heroes-webapp.appspot.com",
      messagingSenderId: "...",
      appId: "1:..."
    };
    ```

## 3단계: 웹사이트 코드에 설정값 적용

1.  프로젝트 코드에서 `/frontend/scripts/firebase-config.js` 파일을 엽니다.
2.  파일 내용이 아래와 같이 플레이스홀더 값으로 채워져 있습니다.

    ```javascript
    // /frontend/scripts/firebase-config.js

    // TODO: Firebase Console에서 복사한 실제 설정값으로 교체하세요.
    const firebaseConfig = {
        apiKey: "YOUR_API_KEY",
        authDomain: "YOUR_AUTH_DOMAIN",
        projectId: "YOUR_PROJECT_ID",
        storageBucket: "YOUR_STORAGE_BUCKET",
        messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
        appId: "YOUR_APP_ID"
    };

    // Firebase 앱 초기화
    const app = firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();
    ```

3.  이 파일의 `firebaseConfig` 객체 내용을 2단계에서 복사한 실제 값으로 **모두 교체**합니다.

## 4단계: 인증 방법 활성화

1.  Firebase Console의 왼쪽 메뉴에서 **Authentication**으로 이동합니다.
2.  **Sign-in method** 탭을 선택합니다.
3.  **이메일/비밀번호** 제공업체를 클릭하고 "사용 설정" 스위치를 켠 후 저장합니다.
4.  **Google** 제공업체를 클릭하고 "사용 설정" 스위치를 켭니다. 프로젝트 지원 이메일을 선택하고 저장합니다.

## 5단계: Firestore 데이터베이스 설정

1.  Firebase Console의 왼쪽 메뉴에서 **Firestore Database**로 이동합니다.
2.  **데이터베이스 만들기** 버튼을 클릭합니다.
3.  **테스트 모드에서 시작**을 선택하고 "다음"을 클릭합니다. (주의: 테스트 모드는 30일 동안만 모든 읽기/쓰기를 허용합니다. 프로덕션 전환 시 보안 규칙 수정이 필요합니다.)
4.  Cloud Firestore 위치를 선택하고 (기본값 사용 가능) "사용 설정"을 클릭합니다.

---

위 단계를 모두 완료하면 웹사이트의 회원가입, 로그인, 프로필 관리 기능이 정상적으로 동작합니다.
