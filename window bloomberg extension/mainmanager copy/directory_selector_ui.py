#!/usr/bin/env python3
"""
Simple GUI for selecting monitoring directory before running the main application
"""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import json
import os
from pathlib import Path

class DirectorySelectorUI:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Bloomberg Extension - Directory Setup")
        self.root.geometry("600x400")
        self.root.resizable(True, True)
        
        # Variables
        self.pdf_incoming_dir = tk.StringVar()
        self.backup_dir = tk.StringVar()
        self.config_path = Path(__file__).parent / "config.json"
        
        # Load existing config if available
        self.load_existing_config()
        
        self.setup_ui()
        self.center_window()
    
    def center_window(self):
        """Center the window on screen"""
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f'{width}x{height}+{x}+{y}')
    
    def setup_ui(self):
        """Setup the user interface"""
        # Main frame
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        
        # Title
        title_label = ttk.Label(main_frame, text="Bloomberg Extension Setup", 
                               font=('Arial', 16, 'bold'))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 20))
        
        # Description
        desc_label = ttk.Label(main_frame, 
                              text="Select directories for PDF monitoring and backup storage:",
                              font=('Arial', 10))
        desc_label.grid(row=1, column=0, columnspan=3, pady=(0, 20))
        
        # PDF Incoming Directory
        ttk.Label(main_frame, text="PDF Monitoring Directory:", 
                 font=('Arial', 10, 'bold')).grid(row=2, column=0, sticky=tk.W, pady=5)
        
        pdf_frame = ttk.Frame(main_frame)
        pdf_frame.grid(row=3, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=5)
        pdf_frame.columnconfigure(0, weight=1)
        
        self.pdf_entry = ttk.Entry(pdf_frame, textvariable=self.pdf_incoming_dir, width=60)
        self.pdf_entry.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 10))
        
        ttk.Button(pdf_frame, text="Browse", 
                  command=self.browse_pdf_directory).grid(row=0, column=1)
        
        # Backup Directory
        ttk.Label(main_frame, text="Backup Directory:", 
                 font=('Arial', 10, 'bold')).grid(row=4, column=0, sticky=tk.W, pady=(20, 5))
        
        backup_frame = ttk.Frame(main_frame)
        backup_frame.grid(row=5, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=5)
        backup_frame.columnconfigure(0, weight=1)
        
        self.backup_entry = ttk.Entry(backup_frame, textvariable=self.backup_dir, width=60)
        self.backup_entry.grid(row=0, column=0, sticky=(tk.W, tk.E), padx=(0, 10))
        
        ttk.Button(backup_frame, text="Browse", 
                  command=self.browse_backup_directory).grid(row=0, column=1)
        
        # Buttons
        button_frame = ttk.Frame(main_frame)
        button_frame.grid(row=6, column=0, columnspan=3, pady=(40, 0))
        
        ttk.Button(button_frame, text="Create Directories", 
                  command=self.create_directories).pack(side=tk.LEFT, padx=(0, 10))
        
        ttk.Button(button_frame, text="Save & Start Application", 
                  command=self.save_and_start, 
                  style='Accent.TButton').pack(side=tk.LEFT, padx=(0, 10))
        
        ttk.Button(button_frame, text="Cancel", 
                  command=self.cancel).pack(side=tk.LEFT)
        
        # Status frame
        self.status_frame = ttk.LabelFrame(main_frame, text="Status", padding="10")
        self.status_frame.grid(row=7, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(20, 0))
        
        self.status_label = ttk.Label(self.status_frame, text="Select directories to continue...")
        self.status_label.pack()
        
    def load_existing_config(self):
        """Load existing configuration if available"""
        try:
            if self.config_path.exists():
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                
                # Set existing directories
                pdf_dir = config.get('directories', {}).get('pdf_incoming', '')
                backup_dir = config.get('directories', {}).get('backup', '')
                
                # Convert Unix paths to Windows paths if needed
                if pdf_dir.startswith('/'):
                    pdf_dir = pdf_dir.replace('/', '\\')
                if backup_dir.startswith('/'):
                    backup_dir = backup_dir.replace('/', '\\')
                
                self.pdf_incoming_dir.set(pdf_dir)
                self.backup_dir.set(backup_dir)
                
        except Exception as e:
            print(f"Could not load existing config: {e}")
    
    def browse_pdf_directory(self):
        """Browse for PDF monitoring directory"""
        directory = filedialog.askdirectory(
            title="Select PDF Monitoring Directory",
            initialdir=self.pdf_incoming_dir.get() or os.path.expanduser("~/Desktop")
        )
        if directory:
            self.pdf_incoming_dir.set(directory)
            self.update_status()
    
    def browse_backup_directory(self):
        """Browse for backup directory"""
        directory = filedialog.askdirectory(
            title="Select Backup Directory",
            initialdir=self.backup_dir.get() or os.path.expanduser("~/Desktop")
        )
        if directory:
            self.backup_dir.set(directory)
            self.update_status()
    
    def create_directories(self):
        """Create the selected directories if they don't exist"""
        try:
            pdf_dir = self.pdf_incoming_dir.get().strip()
            backup_dir = self.backup_dir.get().strip()
            
            if not pdf_dir or not backup_dir:
                messagebox.showerror("Error", "Please select both directories")
                return
            
            # Create directories
            Path(pdf_dir).mkdir(parents=True, exist_ok=True)
            Path(backup_dir).mkdir(parents=True, exist_ok=True)
            
            self.update_status("Directories created successfully!")
            messagebox.showinfo("Success", "Directories created successfully!")
            
        except Exception as e:
            error_msg = f"Error creating directories: {str(e)}"
            self.update_status(error_msg)
            messagebox.showerror("Error", error_msg)
    
    def save_and_start(self):
        """Save configuration and start the main application"""
        try:
            pdf_dir = self.pdf_incoming_dir.get().strip()
            backup_dir = self.backup_dir.get().strip()
            
            if not pdf_dir or not backup_dir:
                messagebox.showerror("Error", "Please select both directories")
                return
            
            # Validate directories exist or can be created
            try:
                Path(pdf_dir).mkdir(parents=True, exist_ok=True)
                Path(backup_dir).mkdir(parents=True, exist_ok=True)
            except Exception as e:
                error_msg = f"Cannot create directories: {str(e)}"
                messagebox.showerror("Error", error_msg)
                return
            
            # Load existing config or create new one
            config = self.load_config_template()
            
            # Update directories
            config['directories']['pdf_incoming'] = pdf_dir.replace('\\', '/')
            config['directories']['backup'] = backup_dir.replace('\\', '/')
            
            # Save config
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=4)
            
            self.update_status("Configuration saved! Starting application...")
            
            # Close UI and signal to start main application
            self.result = "start"
            self.root.quit()
            
        except Exception as e:
            error_msg = f"Error saving configuration: {str(e)}"
            self.update_status(error_msg)
            messagebox.showerror("Error", error_msg)
    
    def load_config_template(self):
        """Load existing config or return template"""
        try:
            if self.config_path.exists():
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except:
            pass
        
        # Default config template
        return {
            "database": {
                "server": "sangsay.database.windows.net",
                "database": "SQL TEST",
                "username": "sangsay",
                "password": "coronafranklinorganization168!"
            },
            "directories": {
                "pdf_incoming": "",
                "backup": ""
            },
            "processing": {
                "scan_interval": 10,
                "max_retries": 3,
                "retry_delay": 5,
                "batch_size": 5
            },
            "gemini_api_key": None
        }
    
    def cancel(self):
        """Cancel and exit"""
        self.result = "cancel"
        self.root.quit()
    
    def update_status(self, message=None):
        """Update status message"""
        if message:
            self.status_label.config(text=message)
        else:
            pdf_dir = self.pdf_incoming_dir.get().strip()
            backup_dir = self.backup_dir.get().strip()
            
            if pdf_dir and backup_dir:
                self.status_label.config(text="Ready to save configuration and start!")
            elif pdf_dir:
                self.status_label.config(text="Please select backup directory...")
            elif backup_dir:
                self.status_label.config(text="Please select PDF monitoring directory...")
            else:
                self.status_label.config(text="Select directories to continue...")
    
    def run(self):
        """Run the UI"""
        self.result = "cancel"
        self.root.mainloop()
        return self.result

def main():
    """Main entry point"""
    app = DirectorySelectorUI()
    result = app.run()
    
    if result == "start":
        print("Starting main application...")
        # Import and run the main application
        try:
            from mainmanager_fixed import main as main_app
            main_app()
        except ImportError as e:
            print(f"Could not import main application: {e}")
            print("Please run: python mainmanager.py")
    else:
        print("Setup cancelled.")

if __name__ == "__main__":
    main()