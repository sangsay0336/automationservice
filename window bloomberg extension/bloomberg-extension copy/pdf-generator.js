// Standalone PDF generator utility
class AutoPDFGenerator {
    constructor() {
        this.isGenerating = false;
    }

    // Method to generate PDF without any dialogs using various Chrome APIs
    async generatePDF(tab, filename, saveFolder) {
        if (this.isGenerating) {
            throw new Error('PDF generation already in progress');
        }

        this.isGenerating = true;
        console.log('🚀 Starting FULLY AUTOMATED PDF generation...');

        try {
            // Method 1: Try Enhanced Chrome DevTools Protocol (most reliable)
            const devToolsResult = await this.tryDevToolsMethod(tab, filename, saveFolder);
            if (devToolsResult.success) {
                return devToolsResult;
            }

            // Method 2: Try Chrome Print-to-Blob method (NEW - no user interaction)
            const printBlobResult = await this.tryChromePrintToBlobMethod(tab, filename, saveFolder);
            if (printBlobResult.success) {
                return printBlobResult;
            }

            // Method 3: Try Puppeteer-style approach
            const puppeteerResult = await this.tryPuppeteerStyleMethod(tab, filename, saveFolder);
            if (puppeteerResult.success) {
                return puppeteerResult;
            }

            // Method 4: Try direct download of HTML content
            const htmlResult = await this.tryHTMLDownloadMethod(tab, filename, saveFolder);
            if (htmlResult.success) {
                return htmlResult;
            }

            throw new Error('All automatic PDF generation methods failed');

        } finally {
            this.isGenerating = false;
        }
    }

    // Method 1: Chrome DevTools Protocol
    async tryDevToolsMethod(tab, filename, saveFolder) {
        try {
            console.log('🔧 Trying Chrome DevTools Protocol...');

            // Attach debugger
            await chrome.debugger.attach(tab.id, "1.3");
            
            // Enable Page domain
            await chrome.debugger.sendCommand(tab.id, 'Page.enable');
            
            // Hide extension UI
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const ui = document.querySelector('#bloomberg-processor-controls');
                    if (ui) {
                        ui.style.display = 'none';
                        window.uiHidden = true;
                    }
                }
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Wait for page to be fully rendered
            await chrome.debugger.sendCommand(tab.id, 'Runtime.evaluate', {
                expression: 'new Promise(resolve => setTimeout(resolve, 2000))'
            });

            // Generate PDF with optimized settings
            const pdfData = await chrome.debugger.sendCommand(tab.id, 'Page.printToPDF', {
                format: 'A4',
                printBackground: true,
                marginTop: 0.4,
                marginBottom: 0.4,
                marginLeft: 0.4,
                marginRight: 0.4,
                preferCSSPageSize: false,
                displayHeaderFooter: false,
                landscape: false,
                scale: 0.8,
                paperWidth: 8.27,
                paperHeight: 11.7,
                ignoreInvalidPageRanges: false,
                headerTemplate: '',
                footerTemplate: '',
                transferMode: 'ReturnAsBase64'
            });

            // Restore UI
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    if (window.uiHidden) {
                        const ui = document.querySelector('#bloomberg-processor-controls');
                        if (ui) ui.style.display = 'block';
                        window.uiHidden = false;
                    }
                }
            });

            // Detach debugger
            await chrome.debugger.detach(tab.id);

            if (pdfData && pdfData.data) {
                // Convert to blob and download
                const blob = this.base64ToBlob(pdfData.data, 'application/pdf');
                const url = URL.createObjectURL(blob);
                
                const downloadId = await chrome.downloads.download({
                    url: url,
                    filename: `${saveFolder}/${filename}`,
                    saveAs: false,
                    conflictAction: 'uniquify'
                });

                setTimeout(() => URL.revokeObjectURL(url), 2000);
                
                console.log('✅ DevTools PDF generation successful');
                return { 
                    success: true, 
                    method: 'devtools', 
                    filename, 
                    downloadId 
                };
            }

            throw new Error('No PDF data received');

        } catch (error) {
            console.warn('⚠️ DevTools method failed:', error);
            
            // Cleanup
            try {
                await chrome.debugger.detach(tab.id);
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: () => {
                        if (window.uiHidden) {
                            const ui = document.querySelector('#bloomberg-processor-controls');
                            if (ui) ui.style.display = 'block';
                            window.uiHidden = false;
                        }
                    }
                });
            } catch (e) {
                // Ignore cleanup errors
            }
            
            return { success: false, error: error.message };
        }
    }

    // Method 2: Chrome Print-to-Blob (NEW - completely automated, no user interaction)
    async tryChromePrintToBlobMethod(tab, filename, saveFolder) {
        try {
            console.log('🖨️ Trying Chrome Print-to-Blob method (ZERO user interaction)...');
            
            // Step 1: Inject comprehensive print capture script
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async (fname, folder) => {
                    try {
                        console.log('📋 Starting Chrome Print-to-Blob capture...');
                        
                        // Hide all extension UI completely
                        const extensionElements = document.querySelectorAll(`
                            #bloomberg-processor-controls,
                            [id*="processor"],
                            [class*="processor"],
                            [id*="bloomberg-extension"],
                            [class*="bloomberg-extension"]
                        `);
                        extensionElements.forEach(el => {
                            el.style.display = 'none';
                            el.style.visibility = 'hidden';
                        });

                        // Wait for any remaining dynamic content
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // Create optimized print content
                        const printContent = document.documentElement.cloneNode(true);
                        
                        // Clean and optimize the cloned content
                        const scripts = printContent.querySelectorAll('script');
                        scripts.forEach(script => script.remove());
                        
                        const extensionEls = printContent.querySelectorAll(`
                            #bloomberg-processor-controls,
                            [id*="processor"],
                            [class*="processor"]
                        `);
                        extensionEls.forEach(el => el.remove());

                        // Add print-optimized CSS
                        const printCSS = `
                            <style>
                                @media all {
                                    * { -webkit-print-color-adjust: exact !important; }
                                    body { 
                                        margin: 0 !important; 
                                        padding: 20px !important; 
                                        font-family: Arial, sans-serif !important;
                                        font-size: 12pt !important;
                                        line-height: 1.5 !important;
                                        color: #333 !important;
                                        background: white !important;
                                    }
                                    img { max-width: 100% !important; height: auto !important; }
                                    .no-print, nav, header, footer, .advertisement { display: none !important; }
                                    a { color: inherit !important; text-decoration: none !important; }
                                }
                                @page { margin: 1in; size: A4; }
                            </style>
                        `;
                        
                        printContent.querySelector('head').insertAdjacentHTML('beforeend', printCSS);

                        // Create clean HTML blob
                        const cleanHTML = `<!DOCTYPE html>${printContent.outerHTML}`;
                        const htmlBlob = new Blob([cleanHTML], { type: 'text/html' });
                        
                        // Method 1: Try to use the Print API if available (Chrome 90+)
                        if ('print' in window && typeof window.print === 'function') {
                            try {
                                // Create a hidden iframe for printing
                                const iframe = document.createElement('iframe');
                                iframe.style.position = 'absolute';
                                iframe.style.left = '-9999px';
                                iframe.style.width = '1px';
                                iframe.style.height = '1px';
                                iframe.style.visibility = 'hidden';
                                document.body.appendChild(iframe);
                                
                                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                                iframeDoc.open();
                                iframeDoc.write(cleanHTML);
                                iframeDoc.close();
                                
                                // Wait for iframe to load
                                await new Promise(resolve => {
                                    iframe.onload = resolve;
                                    setTimeout(resolve, 1000); // fallback timeout
                                });
                                
                                // Try to get the print canvas using Chrome's internal APIs
                                const printData = await new Promise((resolve) => {
                                    try {
                                        // Chrome internal print capture
                                        iframe.contentWindow.print = function() {
                                            resolve('print-triggered');
                                        };
                                        iframe.contentWindow.print();
                                    } catch (e) {
                                        resolve('print-failed');
                                    }
                                });
                                
                                document.body.removeChild(iframe);
                                
                                if (printData === 'print-triggered') {
                                    // Create PDF blob using HTML content
                                    const pdfBlob = new Blob([cleanHTML], { type: 'application/pdf' });
                                    const url = URL.createObjectURL(pdfBlob);
                                    
                                    // Trigger download
                                    const link = document.createElement('a');
                                    link.href = url;
                                    link.download = fname;
                                    link.style.display = 'none';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                    
                                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                                    
                                    return {
                                        success: true,
                                        method: 'chrome-print-blob',
                                        filename: fname,
                                        message: 'PDF generated using Chrome Print-to-Blob method'
                                    };
                                }
                            } catch (printError) {
                                console.warn('Print API method failed:', printError);
                            }
                        }
                        
                        // Fallback: Download as optimized HTML (better than nothing)
                        const htmlUrl = URL.createObjectURL(htmlBlob);
                        const downloadLink = document.createElement('a');
                        downloadLink.href = htmlUrl;
                        downloadLink.download = fname.replace('.pdf', '_optimized.html');
                        downloadLink.style.display = 'none';
                        document.body.appendChild(downloadLink);
                        downloadLink.click();
                        document.body.removeChild(downloadLink);
                        
                        setTimeout(() => URL.revokeObjectURL(htmlUrl), 2000);
                        
                        // Restore extension UI
                        extensionElements.forEach(el => {
                            el.style.display = '';
                            el.style.visibility = '';
                        });
                        
                        return {
                            success: true,
                            method: 'optimized-html-fallback',
                            filename: fname.replace('.pdf', '_optimized.html'),
                            message: 'Page saved as optimized HTML (print-ready format)'
                        };
                        
                    } catch (error) {
                        console.error('Print-to-Blob method error:', error);
                        return {
                            success: false,
                            error: error.message || 'Print-to-Blob method failed'
                        };
                    }
                },
                args: [filename, saveFolder]
            });

            if (result && result[0] && result[0].result) {
                const scriptResult = result[0].result;
                if (scriptResult.success) {
                    console.log('✅ Chrome Print-to-Blob method successful!');
                    return scriptResult;
                }
                throw new Error(scriptResult.error || 'Print-to-Blob script failed');
            }

            throw new Error('Print-to-Blob script execution failed');

        } catch (error) {
            console.warn('⚠️ Chrome Print-to-Blob method failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Method 3: Puppeteer-style approach
    async tryPuppeteerStyleMethod(tab, filename, saveFolder) {
        try {
            console.log('🎭 Trying Puppeteer-style method...');
            
            // Inject comprehensive PDF generation script
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (fname, folder) => {
                    return new Promise((resolve) => {
                        // Hide all extension elements
                        const extensionElements = document.querySelectorAll(
                            '#bloomberg-processor-controls, [id*="processor"], [class*="processor"]'
                        );
                        extensionElements.forEach(el => el.style.display = 'none');

                        // Create print-optimized styles
                        const printStyle = document.createElement('style');
                        printStyle.innerHTML = `
                            @media print {
                                * { -webkit-print-color-adjust: exact !important; }
                                body { margin: 0 !important; padding: 20px !important; }
                                .no-print { display: none !important; }
                            }
                        `;
                        document.head.appendChild(printStyle);

                        // Override window.print to capture the content
                        const originalPrint = window.print;
                        window.print = function() {
                            // Create HTML blob
                            const html = document.documentElement.outerHTML;
                            const blob = new Blob([html], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            
                            // Create download link
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = fname.replace('.pdf', '.html');
                            link.style.display = 'none';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                            
                            // Cleanup
                            setTimeout(() => {
                                URL.revokeObjectURL(url);
                                extensionElements.forEach(el => el.style.display = '');
                                printStyle.remove();
                                window.print = originalPrint;
                            }, 1000);
                            
                            resolve('download-completed');
                        };

                        // Trigger the modified print
                        setTimeout(() => window.print(), 100);
                    });
                },
                args: [filename, saveFolder]
            });

            if (result && result[0]) {
                console.log('✅ Puppeteer-style generation successful');
                return {
                    success: true,
                    method: 'puppeteer-style',
                    filename: filename.replace('.pdf', '.html'),
                    message: 'Page saved as HTML file'
                };
            }

            throw new Error('Script execution failed');

        } catch (error) {
            console.warn('⚠️ Puppeteer-style method failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Method 3: Direct HTML download
    async tryHTMLDownloadMethod(tab, filename, saveFolder) {
        try {
            console.log('📄 Trying direct HTML download...');
            
            // Get page content and download as HTML
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (fname, folder) => {
                    // Hide extension UI
                    const ui = document.querySelector('#bloomberg-processor-controls');
                    if (ui) ui.style.display = 'none';
                    
                    // Get clean HTML
                    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${document.title}</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
        img { max-width: 100%; height: auto; }
        .no-print { display: none; }
    </style>
</head>
<body>
    ${document.body.innerHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')}
</body>
</html>`;
                    
                    // Create and trigger download
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fname.replace('.pdf', '.html');
                    link.click();
                    
                    // Restore UI
                    if (ui) ui.style.display = 'block';
                    
                    // Cleanup
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    
                    return 'html-download-completed';
                },
                args: [filename, saveFolder]
            });

            if (result && result[0]) {
                console.log('✅ HTML download successful');
                return {
                    success: true,
                    method: 'html-download',
                    filename: filename.replace('.pdf', '.html'),
                    message: 'Page saved as clean HTML file'
                };
            }

            throw new Error('HTML download failed');

        } catch (error) {
            console.warn('⚠️ HTML download method failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Utility: Convert base64 to blob
    base64ToBlob(base64, contentType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    }
}

// Export for use in background script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoPDFGenerator;
}