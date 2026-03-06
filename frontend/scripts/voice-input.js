/**
 * Voice Input Module
 * Handles microphone device selection and speech-to-text conversion
 */

class VoiceInput {
  constructor(inputElement, sendButtonElement) {
    this.inputElement = inputElement;
    this.sendButtonElement = sendButtonElement;
    this.isListening = false;
    this.recognition = null;
    this.selectedDeviceId = null;
    this.mediaStream = null;
    
    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition API not supported');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.lang = this.getCurrentLanguage();

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateMicrophoneIcon(true);
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        this.inputElement.value = finalTranscript.trim();
      } else if (interimTranscript) {
        this.inputElement.placeholder = interimTranscript;
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.updateMicrophoneIcon(false);
      this.showError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.updateMicrophoneIcon(false);
    };
  }

  getCurrentLanguage() {
    if (window.languageSwitcher) {
      const lang = window.languageSwitcher.getCurrentLanguage();
      return lang === 'ko' ? 'ko-KR' : 'en-US';
    }
    const lang = localStorage.getItem('littleHeroesLanguage') || 'en';
    return lang === 'ko' ? 'ko-KR' : 'en-US';
  }

  async selectMicrophone() {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      // Get available audio input devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      if (audioInputs.length === 0) {
        this.showError('마이크를 찾을 수 없습니다.');
        return;
      }

      if (audioInputs.length === 1) {
        // Only one microphone, use it directly
        this.selectedDeviceId = audioInputs[0].deviceId;
        this.startListening();
        return;
      }

      // Show device selection dialog
      this.showDeviceSelectionDialog(audioInputs);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      this.showError(`마이크 접근 실패: ${error.message}`);
    }
  }

  showDeviceSelectionDialog(devices) {
    const lang = this.getCurrentLanguage().startsWith('ko') ? 'ko' : 'en';
    
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'voice-device-modal';
    modal.innerHTML = `
      <div class="voice-device-dialog">
        <div class="voice-device-header">
          <h3>${lang === 'ko' ? '마이크 선택' : 'Select Microphone'}</h3>
          <button class="voice-device-close" aria-label="Close">&times;</button>
        </div>
        <div class="voice-device-list">
          ${devices.map((device, index) => `
            <button class="voice-device-option" data-device-id="${device.deviceId}">
              <span class="device-label">${device.label || `${lang === 'ko' ? '마이크' : 'Microphone'} ${index + 1}`}</span>
              <span class="device-icon">🎤</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add styles if not already present
    if (!document.getElementById('voice-input-styles')) {
      const styles = document.createElement('style');
      styles.id = 'voice-input-styles';
      styles.textContent = `
        .voice-device-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(3px);
        }

        .voice-device-dialog {
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          max-width: 400px;
          width: 90%;
          max-height: 70vh;
          overflow-y: auto;
          animation: slideUp 0.3s ease-out;
        }

        @keyframes slideUp {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        .voice-device-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid #e0e0e0;
          background: linear-gradient(135deg, #42A5F5 0%, #1E88E5 100%);
          color: white;
          border-radius: 12px 12px 0 0;
        }

        .voice-device-header h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
        }

        .voice-device-close {
          background: none;
          border: none;
          color: white;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background 0.2s;
        }

        .voice-device-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .voice-device-list {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .voice-device-option {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f5f5f5;
          border: 2px solid transparent;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
          font-weight: 500;
          color: #333;
        }

        .voice-device-option:hover {
          background: #e3f2fd;
          border-color: #42A5F5;
        }

        .voice-device-option:active {
          transform: scale(0.98);
        }

        .device-label {
          flex: 1;
          text-align: left;
        }

        .device-icon {
          font-size: 18px;
          margin-left: 8px;
        }
      `;
      document.head.appendChild(styles);
    }

    // Event listeners
    const closeBtn = modal.querySelector('.voice-device-close');
    const deviceOptions = modal.querySelectorAll('.voice-device-option');

    closeBtn.addEventListener('click', () => {
      modal.remove();
      // Stop media stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
      }
    });

    deviceOptions.forEach(option => {
      option.addEventListener('click', () => {
        this.selectedDeviceId = option.dataset.deviceId;
        modal.remove();
        this.startListening();
      });
    });
  }

  startListening() {
    if (!this.recognition) {
      this.showError('음성 인식을 지원하지 않습니다.');
      return;
    }

    try {
      // Update language
      this.recognition.lang = this.getCurrentLanguage();
      
      // Start recognition
      this.recognition.start();
    } catch (error) {
      console.error('Error starting recognition:', error);
      this.showError(`음성 인식 시작 실패: ${error.message}`);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  updateMicrophoneIcon(isActive) {
    const micIcon = document.querySelector('.chat-icon[alt="Microphone"]');
    if (micIcon) {
      if (isActive) {
        micIcon.style.opacity = '0.5';
        micIcon.style.animation = 'pulse 1s infinite';
      } else {
        micIcon.style.opacity = '1';
        micIcon.style.animation = 'none';
      }
    }
  }

  showError(message) {
    const lang = this.getCurrentLanguage().startsWith('ko') ? 'ko' : 'en';
    alert(message || (lang === 'ko' ? '오류가 발생했습니다.' : 'An error occurred.'));
  }

  attachToMicrophoneIcon() {
    const micIcon = document.querySelector('.chat-icon[alt="Microphone"]');
    if (micIcon) {
      micIcon.style.cursor = 'pointer';
      micIcon.addEventListener('click', () => {
        this.selectMicrophone();
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const inputElement = document.getElementById('character-input');
  const sendButton = document.getElementById('character-send');

  if (inputElement && sendButton) {
    const voiceInput = new VoiceInput(inputElement, sendButton);
    voiceInput.attachToMicrophoneIcon();

    // Update language when language changes
    window.addEventListener('languageChanged', (e) => {
      if (voiceInput.recognition) {
        voiceInput.recognition.lang = voiceInput.getCurrentLanguage();
      }
    });
  }
});
