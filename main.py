import webview
import threading
import torch
import pyaudio
import os
import sounddevice as sd
import numpy as np
import torchaudio as ta
import pygame
from datetime import datetime
from chatterbox.vc import ChatterboxVC
import json
import glob
from PIL import Image
import base64
from io import BytesIO

class VoiceConversionAPI:
    """API class to handle voice conversion operations"""
    
    def __init__(self):
        self.is_recording = False
        self.recorded_file_path = None
        self.converted_file_path = None
        self.target_voice_path = None
        self.selected_vip = None
        
        # Audio recording parameters
        self.channels = 2
        self.rate = 44100
        self.frames = []
        self.model = None
        
        # Initialize pygame mixer for playback
        pygame.mixer.init()
        
        # Setup directories
        self.setup_directories()
        
        # Load VIP data
        self.vips = self.load_vips()
    
    def setup_directories(self):
        """Create necessary directories"""
        os.makedirs("recordings", exist_ok=True)
        os.makedirs("converted", exist_ok=True)
        os.makedirs("images", exist_ok=True)
        os.makedirs("voices", exist_ok=True)
    
    # def load_vips(self):
    #     """Load VIP data from images and voices directories"""
    #     vips = {}
        
    #     # Scan images directory
    #     image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.webp']
    #     for ext in image_extensions:
    #         for image_path in glob.glob(f"images/{ext}"):
    #             name = os.path.splitext(os.path.basename(image_path))[0]
                
    #             # Convert image to base64 for web display
    #             try:
    #                 with Image.open(image_path) as img:
    #                     img.thumbnail((150, 150), Image.Resampling.LANCZOS)
    #                     buffered = BytesIO()
    #                     img.save(buffered, format="JPEG")
    #                     img_str = base64.b64encode(buffered.getvalue()).decode()
                        
    #                     # Check for matching voice file
    #                     voice_extensions = ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg']
    #                     voice_path = None
    #                     for voice_ext in voice_extensions:
    #                         potential_voice = f"voices/{name}.{voice_ext}"
    #                         if os.path.exists(potential_voice):
    #                             voice_path = potential_voice
    #                             break
                        
    #                     vips[name] = {
    #                         'name': name.replace('_', ' ').title(),
    #                         'image': f"data:image/jpeg;base64,{img_str}",
    #                         'voice_path': voice_path,
    #                         'has_voice': voice_path is not None
    #                     }
    #             except Exception as e:
    #                 print(f"Error processing image {image_path}: {e}")
        
    #     return vips

    def load_vips(self):
        """Load VIP data from images and voices directories"""
        vips = {}
        
        # Scan images directory
        image_extensions = ['*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.webp']
        for ext in image_extensions:
            for image_path in glob.glob(f"images/{ext}"):
                name = os.path.splitext(os.path.basename(image_path))[0]
                
                try:
                    # Check for matching voice file
                    voice_extensions = ['wav', 'mp3', 'm4a', 'flac', 'aac', 'ogg']
                    voice_path = None
                    for voice_ext in voice_extensions:
                        potential_voice = f"voices/{name}.{voice_ext}"
                        if os.path.exists(potential_voice):
                            voice_path = potential_voice
                            break
                    
                    # Use relative path for HTTP server
                    image_filename = os.path.basename(image_path)
                    
                    vips[name] = {
                        'name': name.replace('_', ' ').title(),
                        'image': f"images/{image_filename}",  # Relative path for HTTP server
                        'voice_path': voice_path,
                        'has_voice': voice_path is not None
                    }
                except Exception as e:
                    print(f"Error processing image {image_path}: {e}")
        
        return vips

    
    def get_vips(self):
        """Return VIP data for frontend"""
        return list(self.vips.values())
    
    def get_device_info(self):
        """Get device information"""
        if torch.cuda.is_available():
            device = "cuda"
            device_info = "GPU (CUDA)"
        elif torch.backends.mps.is_available():
            device = "mps" 
            device_info = "GPU (Metal)"
        else:
            device = "cpu"
            device_info = "CPU"
        
        return {"device": device, "device_info": device_info}
    
    def load_model(self):
        """Load the voice conversion model"""
        try:
            device_info = self.get_device_info()
            print(f"Loading model on {device_info['device']}...")
            self.model = ChatterboxVC.from_pretrained(device_info['device'])
            print("Model loaded successfully!")
            return {"success": True, "message": "Model loaded successfully!"}
        except Exception as e:
            error_msg = f"Error loading model: {e}"
            print(error_msg)
            return {"success": False, "message": error_msg}
    
    def select_vip(self, vip_name):
        """Select a VIP for voice conversion"""
        for name, vip_data in self.vips.items():
            if vip_data['name'] == vip_name:
                self.selected_vip = vip_data
                self.target_voice_path = vip_data['voice_path']
                return {"success": True, "message": f"Selected {vip_name}"}
        
        return {"success": False, "message": "VIP not found"}
    
    def start_recording(self):
        """Start audio recording"""        
        if self.is_recording:
            return {"success": False, "message": "Already recording"}
        
        try:
            self.is_recording = True
            self.frames = []
            
            # Start recording in a separate thread
            self.recording_thread = threading.Thread(target=self._record_audio)
            self.recording_thread.daemon = True
            self.recording_thread.start()
            
            return {"success": True, "message": "Recording started"}
            
        except Exception as e:
            self.is_recording = False
            return {"success": False, "message": f"Failed to start recording: {str(e)}"}
    
    def stop_recording(self):
        """Stop audio recording"""
        if not self.is_recording:
            return {"success": False, "message": "Not currently recording"}
        
        self.is_recording = False
        
        if hasattr(self, 'recording_thread'):
            self.recording_thread.join()
        
        return self._save_recorded_audio()
    
    def _record_audio(self):
        """Internal method to handle audio recording"""
        try:
            def callback(indata, frames, time, status):
                if status:
                    print(f"Recording status: {status}")
                if not self.is_recording:
                    raise sd.CallbackStop
                self.frames.append(indata.copy())

            with sd.InputStream(
                samplerate=self.rate,
                channels=self.channels,
                callback=callback
            ):
                while self.is_recording:
                    sd.sleep(100)

        except Exception as e:
            print(f"Recording error: {e}")
    
    def _save_recorded_audio(self):
        """Save recorded audio to file"""
        if not self.frames:
            return {"success": False, "message": "No audio was recorded"}
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.recorded_file_path = f"recordings/recorded_{timestamp}.wav"
        
        try:
            audio = np.concatenate(self.frames, axis=0)
            audio_tensor = torch.from_numpy(audio).float().T
            ta.save(self.recorded_file_path, audio_tensor, self.rate)
            
            filename = self.recorded_file_path.split('/')[-1]
            return {
                "success": True, 
                "message": f"Recording saved as {filename}",
                "file_path": self.recorded_file_path
            }
            
        except Exception as e:
            return {"success": False, "message": f"Failed to save recording: {str(e)}"}
    
    def load_audio_file(self):
        """Open file dialog to load audio file"""
        result = webview.windows[0].create_file_dialog(
            webview.FileDialog.OPEN,
            allow_multiple=False,
            file_types=('Audio Files (*.wav;*.mp3;*.m4a;*.flac;*.aac;*.ogg)', 'All files (*.*)')
        )
        
        if result and len(result) > 0:
            file_path = result[0]
            self.recorded_file_path = file_path
            filename = file_path.split('/')[-1]
            
            return {
                "success": True,
                "message": f"Loaded: {filename}",
                "file_path": file_path
            }
        
        return {"success": False, "message": "No file selected"}
    
    def convert_audio(self):
        """Convert audio using the voice conversion model"""
        if not self.model:
            return {"success": False, "message": "Model not loaded. Please wait for initialization."}
        
        if not self.recorded_file_path or not os.path.exists(self.recorded_file_path):
            return {"success": False, "message": "Please record or load an audio file first."}
        
        if not self.target_voice_path or not os.path.exists(self.target_voice_path):
            return {"success": False, "message": "Please select a valid target voice first."}
        
        try:
            # Run the conversion
            wav = self.model.generate(
                audio=self.recorded_file_path,
                target_voice_path=self.target_voice_path
            )
            
            # Save converted audio
            base_name = os.path.splitext(os.path.basename(self.recorded_file_path))[0]
            target_name = self.selected_vip['name'].replace(' ', '_')
            self.converted_file_path = f"converted/{base_name}_as_{target_name}.wav"
            ta.save(self.converted_file_path, wav, self.model.sr)
            
            return {
                "success": True,
                "message": f"Successfully converted to {self.selected_vip['name']}!",
                "file_path": self.converted_file_path
            }
            
        except Exception as e:
            return {"success": False, "message": f"Failed to convert audio: {str(e)}"}
    
    def play_audio(self, audio_type):
        """Play audio file"""
        file_path = None
        
        if audio_type == "original":
            file_path = self.recorded_file_path
        elif audio_type == "converted":
            file_path = self.converted_file_path
        
        if not file_path or not os.path.exists(file_path):
            return {"success": False, "message": f"No {audio_type} audio file available."}
        
        try:
            # Stop any currently playing audio
            if pygame.mixer.music.get_busy():
                pygame.mixer.music.stop()
            
            pygame.mixer.music.load(file_path)
            pygame.mixer.music.play()
            
            return {"success": True, "message": f"Playing {audio_type} audio"}
            
        except Exception as e:
            return {"success": False, "message": f"Failed to play audio: {str(e)}"}
    
    def stop_audio(self):
        """Stop audio playback"""
        try:
            pygame.mixer.music.stop()
            return {"success": True, "message": "Audio stopped"}
        except Exception as e:
            return {"success": False, "message": f"Failed to stop audio: {str(e)}"}


def main():
    """Main application entry point"""
    # Initialize API
    api = VoiceConversionAPI()
    
    # Get device info
    device_info = api.get_device_info()
    print(f"Using device: {device_info['device']}")
    
    # Load model in background
    def load_model():
        api.load_model()
    
    model_thread = threading.Thread(target=load_model)
    model_thread.daemon = True
    model_thread.start()
    
    # Create webview window
    window = webview.create_window(
        f'Voice Conversion Studio - {device_info["device_info"]}',
        'index.html',
        width=1200,
        height=800,
        min_size=(800, 600),
        js_api=api
    )
    
    print("\nVoice Conversion Studio with Dynamic VIP Gallery is ready!")
    print("Enhanced Features:")
    print("  - Modern web-based interface")
    print("  - Dynamic VIP detection from images folder")
    print("  - Automatic voice file matching")
    print("  - Real-time audio recording")
    print("  - AI-powered voice conversion")
    print("  - Audio file loading support")
    print("  - Built-in audio playback")
    print(f"  - Running on: {device_info['device_info']}")
    
    # Check VIPs
    vip_count = len(api.vips)
    if vip_count == 0:
        print("\nNo VIPs detected in 'images' folder.")
        print("   Add image files to get started!")
    else:
        vip_with_voice = sum(1 for vip in api.vips.values() if vip['has_voice'])
        print(f"\nDetected {vip_count} VIP(s) in gallery")
        print(f"   {vip_with_voice} have matching voice files")
        if vip_with_voice < vip_count:
            print(f"   {vip_count - vip_with_voice} need voice files in 'voices' folder")
    
    # Start the application
    # webview.start(debug=False)
    webview.start(debug=True, http_server=True)


if __name__ == "__main__":
    main()