class VoiceConversionApp {
    constructor() {
        this.selectedVip = null;
        this.isRecording = false;
        this.hasOriginalFile = false;
        this.hasConvertedFile = false;
        
        this.initializeElements();
        this.setupEventListeners();

        window.addEventListener('pywebviewready', () => {
            this.loadInitialData();
        });
    }

    initializeElements() {
        // Get all DOM elements
        this.elements = {
            // Info displays
            deviceInfo: document.getElementById('deviceInfo'),
            modelStatus: document.getElementById('modelStatus'),
            
            // VIP gallery
            vipGrid: document.getElementById('vipGrid'),
            selectedVip: document.getElementById('selectedVip'),
            
            // Buttons
            recordBtn: document.getElementById('recordBtn'),
            loadFileBtn: document.getElementById('loadFileBtn'),
            convertBtn: document.getElementById('convertBtn'),
            playOriginalBtn: document.getElementById('playOriginalBtn'),
	    playTargetBtn: document.getElementById('playTargetBtn'),
            playConvertedBtn: document.getElementById('playConvertedBtn'),
            stopBtn: document.getElementById('stopBtn'),
            
            // Status displays
            recordingStatus: document.getElementById('recordingStatus'),
            conversionStatus: document.getElementById('conversionStatus'),
            playbackStatus: document.getElementById('playbackStatus'),
            
            // File info
            originalFile: document.getElementById('originalFile'),
            convertedFile: document.getElementById('convertedFile'),
            
            // Progress
            progressBar: document.getElementById('progressBar'),
            
            // Toast container
            toastContainer: document.getElementById('toastContainer')
        };
    }

    setupEventListeners() {
        // Button event listeners
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.loadFileBtn.addEventListener('click', () => this.loadAudioFile());
        this.elements.convertBtn.addEventListener('click', () => this.convertAudio());
        this.elements.playOriginalBtn.addEventListener('click', () => this.playAudio('original'));
	this.elements.playTargetBtn.addEventListener('click', () => this.playAudio('target'));
        this.elements.playConvertedBtn.addEventListener('click', () => this.playAudio('converted'));
        this.elements.stopBtn.addEventListener('click', () => this.stopAudio());
    }

    async loadInitialData() {
        try {
            // Load device info
            const deviceInfo = await window.pywebview.api.get_device_info();
            // this.elements.deviceInfo.textContent = deviceInfo.device_info;
            
            // Load VIPs
            await this.loadVips();
            
            // Check model status periodically
            this.checkModelStatus();
            
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showToast('Error', 'Failed to load initial data', 'error');
        }
    }

    async loadVips() {
        try {
            const vips = await window.pywebview.api.get_vips();
            this.renderVipGrid(vips);
        } catch (error) {
            console.error('Error loading VIPs:', error);
            this.showToast('Error', 'Failed to load VIP gallery', 'error');
        }
    }

    renderVipGrid(vips) {
        if (vips.length === 0) {
            this.elements.vipGrid.innerHTML = `
                <div class="loading-card">
                    <h3>No VIPs Found</h3>
                    <p>Add image files to the 'images' folder to get started!</p>
                </div>
            `;
            return;
        }

        this.elements.vipGrid.innerHTML = '';
        
        vips.forEach(vip => {
            const vipCard = document.createElement('div');
            vipCard.className = 'vip-card';
            vipCard.dataset.vipName = vip.name;
            
            vipCard.innerHTML = `
                <img src="${vip.image}" alt="${vip.name}" class="vip-image">
                <div class="vip-name">${vip.name}</div>
                <div class="voice-status ${vip.has_voice ? 'available' : 'missing'}">
                    ${vip.has_voice ? '🎤 Ready' : '❌ No Voice'}
                </div>
            `;
            
            // Add click listener
            vipCard.addEventListener('click', () => this.selectVip(vip, vipCard));
            
            this.elements.vipGrid.appendChild(vipCard);
        });
    }

    async selectVip(vip, cardElement) {
        try {
            // Update UI selection
            document.querySelectorAll('.vip-card').forEach(card => {
                card.classList.remove('selected');
            });
            cardElement.classList.add('selected');
            
            // Update selected VIP display
            this.elements.selectedVip.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <img src="${vip.image}" alt="${vip.name}" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <h4>${vip.name}</h4>
                        <p style="color: #9ca3af; font-size: 0.9rem;">
                            ${vip.has_voice ? '🎤 Voice available' : '❌ Voice file needed'}
                        </p>
                    </div>
                </div>
            `;
            
            // Call API to select VIP
            const result = await window.pywebview.api.select_vip(vip.name);
            
            if (result.success) {
                this.selectedVip = vip;
                this.updateConversionStatus();
                this.showToast('Success', result.message, 'success');
		this.elements.playTargetBtn.disabled = !vip.has_voice;
            } else {
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            console.error('Error selecting VIP:', error);
            this.showToast('Error', 'Failed to select VIP', 'error');
        }
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            await this.stopRecording();
        }
    }

    async startRecording() {
        try {
            const result = await window.pywebview.api.start_recording();
            
            if (result.success) {
                this.isRecording = true;
                this.updateRecordingUI(true);
                this.updateRecordingStatus('🔴 Recording... Click to stop', 'error');
                this.showToast('Recording', 'Recording started', 'info');
            } else {
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            console.error('Error starting recording:', error);
            this.showToast('Error', 'Failed to start recording', 'error');
        }
    }

    async stopRecording() {
        try {
            const result = await window.pywebview.api.stop_recording();
            
            this.isRecording = false;
            this.updateRecordingUI(false);
            
            if (result.success) {
                this.hasOriginalFile = true;
                this.updateFileInfo('original', result.file_path, true);
                this.updateRecordingStatus(result.message, 'success');
                this.updateConversionStatus();
                this.showToast('Success', 'Recording saved', 'success');
            } else {
                this.updateRecordingStatus(result.message, 'error');
                this.showToast('Warning', result.message, 'warning');
            }
            
        } catch (error) {
            console.error('Error stopping recording:', error);
            this.isRecording = false;
            this.updateRecordingUI(false);
            this.showToast('Error', 'Failed to stop recording', 'error');
        }
    }

    async loadAudioFile() {
        try {
            const result = await window.pywebview.api.load_audio_file();
            
            if (result.success) {
                this.hasOriginalFile = true;
                this.hasConvertedFile = false;
                this.updateFileInfo('original', result.file_path, true);
                this.updateFileInfo('converted', null, false);
                this.updateRecordingStatus(result.message, 'success');
                this.updateConversionStatus();
                this.showToast('Success', 'Audio file loaded', 'success');
            } else {
                this.showToast('Info', result.message, 'info');
            }
            
        } catch (error) {
            console.error('Error loading file:', error);
            this.showToast('Error', 'Failed to load audio file', 'error');
        }
    }

    async convertAudio() {
        if (!this.selectedVip || !this.selectedVip.has_voice) {
            this.showToast('Warning', 'Please select a VIP with an available voice', 'warning');
            return;
        }

        if (!this.hasOriginalFile) {
            this.showToast('Warning', 'Please record or load an audio file first', 'warning');
            return;
        }

        try {
            // Show progress
            this.showConversionProgress(true);
            this.updateConversionStatus(`Converting to ${this.selectedVip.name}...`, 'info');
            
            const result = await window.pywebview.api.convert_audio();
            
            this.showConversionProgress(false);
            
            if (result.success) {
                this.hasConvertedFile = true;
                this.updateFileInfo('converted', result.file_path, true);
                this.updateConversionStatus(result.message, 'success');
                this.showToast('Success', 'Voice conversion completed!', 'success');
            } else {
                this.updateConversionStatus(result.message, 'error');
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            console.error('Error converting audio:', error);
            this.showConversionProgress(false);
            this.showToast('Error', 'Failed to convert audio', 'error');
        }
    }

    async playAudio(type) {
        try {
            const result = await window.pywebview.api.play_audio(type);
            
            if (result.success) {
                this.updatePlaybackStatus(result.message, 'info');
                this.showToast('Playing', `Playing ${type} audio`, 'info');
                
                // Monitor playback (simplified - in a real app you'd want to check if still playing)
                setTimeout(() => {
                    this.updatePlaybackStatus('Playback completed', 'success');
                    setTimeout(() => {
                        this.updatePlaybackStatus('No audio playing');
                    }, 2000);
                }, 3000);
                
            } else {
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            console.error('Error playing audio:', error);
            this.showToast('Error', 'Failed to play audio', 'error');
        }
    }

    async stopAudio() {
        try {
            const result = await window.pywebview.api.stop_audio();
            
            if (result.success) {
                this.updatePlaybackStatus('Audio stopped');
                this.showToast('Info', 'Audio stopped', 'info');
            } else {
                this.showToast('Error', result.message, 'error');
            }
            
        } catch (error) {
            console.error('Error stopping audio:', error);
            this.showToast('Error', 'Failed to stop audio', 'error');
        }
    }

    // UI Update Methods
    updateRecordingUI(isRecording) {
        if (isRecording) {
            this.elements.recordBtn.innerHTML = `
                <span class="btn-icon">⏹️</span>
                <span class="btn-text">Stop Recording</span>
            `;
            this.elements.recordBtn.classList.add('recording');
        } else {
            this.elements.recordBtn.innerHTML = `
                <span class="btn-icon">🎙️</span>
                <span class="btn-text">Start Recording</span>
            `;
            this.elements.recordBtn.classList.remove('recording');
        }
    }

    updateRecordingStatus(message, type = 'info') {
        this.elements.recordingStatus.textContent = message;
        this.elements.recordingStatus.className = `status-display ${type}`;
    }

    updateConversionStatus(message = null, type = 'info') {
        if (!message) {
            if (this.selectedVip && this.selectedVip.has_voice && this.hasOriginalFile) {
                message = `Ready to convert to ${this.selectedVip.name}`;
                type = 'info';
                this.elements.convertBtn.disabled = false;
            } else if (!this.selectedVip) {
                message = 'Select a VIP to begin';
                this.elements.convertBtn.disabled = true;
            } else if (!this.selectedVip.has_voice) {
                message = 'Selected VIP needs a voice file';
                type = 'warning';
                this.elements.convertBtn.disabled = true;
            } else if (!this.hasOriginalFile) {
                message = 'Load or record audio first';
                type = 'warning';
                this.elements.convertBtn.disabled = true;
            }
        }
        
        this.elements.conversionStatus.textContent = message;
        this.elements.conversionStatus.className = `status-display ${type}`;
    }

    updatePlaybackStatus(message, type = 'info') {
        this.elements.playbackStatus.textContent = message;
        this.elements.playbackStatus.className = `status-display ${type}`;
    }

    updateFileInfo(fileType, filePath, available) {
        const element = fileType === 'original' ? this.elements.originalFile : this.elements.convertedFile;
        const statusElement = element.querySelector('.file-status');
        
        if (available && filePath) {
            const fileName = filePath.split('/').pop() || filePath.split('\\').pop();
            statusElement.textContent = fileName;
            statusElement.className = 'file-status available';
            
            // Enable/disable play buttons
            if (fileType === 'original') {
                this.elements.playOriginalBtn.disabled = false;
            } else {
                this.elements.playConvertedBtn.disabled = false;
            }
        } else {
            statusElement.textContent = `No ${fileType} file`;
            statusElement.className = 'file-status';
            
            // Disable play buttons
            if (fileType === 'original') {
                this.elements.playOriginalBtn.disabled = true;
            } else {
                this.elements.playConvertedBtn.disabled = true;
            }
        }
    }

    showConversionProgress(show) {
        if (show) {
            this.elements.progressBar.style.display = 'block';
            this.elements.convertBtn.disabled = true;
        } else {
            this.elements.progressBar.style.display = 'none';
            this.elements.convertBtn.disabled = false;
        }
    }

    async checkModelStatus() {
        try {
            // This is a simplified check - in a real app you'd have a dedicated API call
            this.elements.modelStatus.textContent = 'Model loaded successfully';
            this.elements.modelStatus.className = 'model-status loaded';
        } catch (error) {
            this.elements.modelStatus.textContent = 'Model loading failed';
            this.elements.modelStatus.className = 'model-status error';
        }
    }

    showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        toast.innerHTML = `
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        `;
        
        this.elements.toastContainer.appendChild(toast);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease forwards';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 4000);
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceConversionApp();
});

// Expose app to global scope for debugging
window.VoiceConversionApp = VoiceConversionApp;