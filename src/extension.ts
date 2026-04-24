import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import { exec, spawn } from 'child_process';
import { parseSeeUploadResponse, resolveUploadSettings, UploadSettings } from './provider-config';

const outputChannel = vscode.window.createOutputChannel('PicGo Paste');

/**
 * Strip ANSI escape codes from terminal output.
 */
function stripAnsi(input: string): string {
    return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * Extract the first URL from combined output.
 */
function extractFirstUrl(output: string): string | null {
    const cleaned = stripAnsi(output).replace(/\r\n/g, '\n');
    const urlMatch = cleaned.match(/https?:\/\/[^\s\]\)\n]+/);
    return urlMatch ? urlMatch[0].trim() : null;
}

/**
 * 获取配置
 */
function getConfig() {
    const config = vscode.workspace.getConfiguration('picgo-paste');
    return resolveUploadSettings({
        provider: config.get<string>('provider', 's.ee'),
        picgoPath: config.get<string>('picgoPath', 'picgo'),
        seeApiKey: config.get<string>('seeApiKey', ''),
        autoUploadOnPaste: config.get<boolean>('autoUploadOnPaste', true)
    }, process.env);
}

function formatTimestamp(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildMarkdownAltText(document: vscode.TextDocument): string {
    const fileName = path.basename(document.fileName, path.extname(document.fileName));
    const normalizedFileName = fileName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const baseName = normalizedFileName || 'image';
    return `${baseName}-${formatTimestamp(new Date())}`;
}

/**
 * 将剪贴板图片保存到临时文件
 */
async function saveClipboardImageToFile(): Promise<string | null> {
    const tempDir = os.tmpdir();
    const tempFileName = `vscode_picgo_${Date.now()}.png`;
    const tempFilePath = path.join(tempDir, tempFileName);

    return new Promise((resolve) => {
        if (process.platform === 'darwin') {
            // macOS: 使用 osascript 保存剪贴板图片
            const script = `
                set theFile to POSIX file "${tempFilePath}"
                try
                    set imageData to the clipboard as «class PNGf»
                    set fileRef to open for access theFile with write permission
                    write imageData to fileRef
                    close access fileRef
                    return "success"
                on error
                    try
                        close access theFile
                    end try
                    return "no image"
                end try
            `;
            
            exec(`osascript -e '${script}'`, (error, stdout) => {
                if (error || stdout.trim() !== 'success') {
                    resolve(null);
                } else {
                    resolve(tempFilePath);
                }
            });
        } else if (process.platform === 'win32') {
            // Windows: 使用 PowerShell
            const script = `
                Add-Type -AssemblyName System.Windows.Forms
                $img = [System.Windows.Forms.Clipboard]::GetImage()
                if ($img -ne $null) {
                    $img.Save('${tempFilePath.replace(/\\/g, '\\\\')}')
                    Write-Output "success"
                } else {
                    Write-Output "no image"
                }
            `;
            
            exec(`powershell -command "${script}"`, (error, stdout) => {
                if (error || stdout.trim() !== 'success') {
                    resolve(null);
                } else {
                    resolve(tempFilePath);
                }
            });
        } else {
            // Linux: 使用 xclip
            exec(`xclip -selection clipboard -t image/png -o > "${tempFilePath}"`, (error) => {
                if (error) {
                    resolve(null);
                } else {
                    fs.stat(tempFilePath, (err, stats) => {
                        if (err || stats.size === 0) {
                            resolve(null);
                        } else {
                            resolve(tempFilePath);
                        }
                    });
                }
            });
        }
    });
}

/**
 * 从 DataTransfer 保存图片到临时文件
 */
async function saveDataTransferImageToFile(dataTransfer: vscode.DataTransfer): Promise<string | null> {
    const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
    
    for (const mimeType of imageTypes) {
        const item = dataTransfer.get(mimeType);
        if (item) {
            try {
                const file = item.asFile();
                if (file) {
                    const data = await file.data();
                    if (data && data.byteLength > 0) {
                        const ext = mimeType.split('/')[1] || 'png';
                        const tempDir = os.tmpdir();
                        const tempFileName = `vscode_picgo_${Date.now()}.${ext}`;
                        const tempFilePath = path.join(tempDir, tempFileName);
                        
                        fs.writeFileSync(tempFilePath, Buffer.from(data));
                        return tempFilePath;
                    }
                }
            } catch (e) {
                console.error('Failed to read image from DataTransfer:', e);
            }
        }
    }
    
    return null;
}

function getMimeTypeFromPath(imagePath: string): string {
    const ext = path.extname(imagePath).toLowerCase();

    switch (ext) {
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.gif':
            return 'image/gif';
        case '.webp':
            return 'image/webp';
        case '.bmp':
            return 'image/bmp';
        case '.png':
        default:
            return 'image/png';
    }
}

/**
 * 调用 picgo 上传图片
 */
async function uploadWithPicgo(imagePath: string): Promise<string | null> {
    const config = getConfig();
    const picgoPath = config.picgoPath;

    return new Promise((resolve) => {
        const args = ['upload', imagePath];
        const spawnOptions = {
            shell: process.platform === 'win32',
            windowsHide: true,
            env: process.env
        };

        outputChannel.appendLine(`[PicGo Paste] exec: ${picgoPath} ${args.map((a) => JSON.stringify(a)).join(' ')}`);
        const picgo = spawn(picgoPath, args, spawnOptions);
        
        let stdout = '';
        let stderr = '';

        picgo.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        picgo.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        picgo.on('close', (code) => {
            if (code === 0) {
                // picgo 成功时会输出上传后的 URL
                const combined = `${stdout}\n${stderr}`;
                const url = extractFirstUrl(combined);
                if (url) {
                    resolve(url);
                    return;
                }

                outputChannel.appendLine('[PicGo Paste] PicGo succeeded but no URL was found in output.');
                outputChannel.appendLine(`[PicGo Paste] stdout: ${stripAnsi(stdout).trim()}`);
                outputChannel.appendLine(`[PicGo Paste] stderr: ${stripAnsi(stderr).trim()}`);
                resolve(null);
            } else {
                outputChannel.appendLine(`[PicGo Paste] PicGo exited with code: ${code}`);
                outputChannel.appendLine(`[PicGo Paste] stdout: ${stripAnsi(stdout).trim()}`);
                outputChannel.appendLine(`[PicGo Paste] stderr: ${stripAnsi(stderr).trim()}`);
                resolve(null);
            }
        });

        picgo.on('error', (err) => {
            outputChannel.appendLine(`[PicGo Paste] Failed to start PicGo: ${String(err)}`);
            resolve(null);
        });
    });
}

async function uploadWithSee(imagePath: string, config: UploadSettings): Promise<string | null> {
    if (!config.seeApiKey) {
        outputChannel.appendLine('[PicGo Paste] Missing S.EE API key. Set SEE_API_TOKEN or picgo-paste.seeApiKey.');
        return null;
    }

    const fileBuffer = fs.readFileSync(imagePath);
    const fileName = path.basename(imagePath);
    const mimeType = getMimeTypeFromPath(imagePath);
    const boundary = `----vscode-picgo-paste-${Date.now().toString(16)}`;
    const preamble = Buffer.from(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="smfile"; filename="${fileName}"\r\n` +
        `Content-Type: ${mimeType}\r\n\r\n`
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`);
    const requestBody = Buffer.concat([preamble, fileBuffer, epilogue]);

    outputChannel.appendLine('[PicGo Paste] Uploading image with S.EE API');

    return new Promise((resolve) => {
        const request = https.request(
            'https://s.ee/api/v1/file/upload',
            {
                method: 'POST',
                headers: {
                    'Authorization': config.seeApiKey,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': requestBody.length
                }
            },
            (response) => {
                let responseBody = '';

                response.on('data', (chunk) => {
                    responseBody += chunk.toString();
                });

                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseBody) as unknown;
                        const imageUrl = parseSeeUploadResponse(parsed as { success?: boolean; data?: { url?: string; }; });

                        if (imageUrl) {
                            resolve(imageUrl);
                            return;
                        }

                        outputChannel.appendLine(`[PicGo Paste] S.EE upload failed: ${responseBody}`);
                        resolve(null);
                    } catch (error) {
                        outputChannel.appendLine(`[PicGo Paste] Failed to parse S.EE response: ${String(error)}`);
                        outputChannel.appendLine(`[PicGo Paste] Raw response: ${responseBody}`);
                        resolve(null);
                    }
                });
            }
        );

        request.on('error', (error) => {
            outputChannel.appendLine(`[PicGo Paste] S.EE request failed: ${String(error)}`);
            resolve(null);
        });

        request.write(requestBody);
        request.end();
    });
}

async function uploadImage(imagePath: string, config: UploadSettings): Promise<string | null> {
    if (config.provider === 'picgo') {
        return uploadWithPicgo(imagePath);
    }

    return uploadWithSee(imagePath, config);
}

/**
 * 在编辑器中插入 Markdown 图片链接
 */
async function insertMarkdownImage(editor: vscode.TextEditor, imageUrl: string) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection).trim();
    const altText = selectedText || buildMarkdownAltText(editor.document);
    const markdownImage = `![${altText}](${imageUrl})`;

    await editor.edit((editBuilder) => {
        if (selection.isEmpty) {
            editBuilder.insert(selection.active, markdownImage);
        } else {
            editBuilder.replace(selection, markdownImage);
        }
    });
}

/**
 * 上传剪贴板图片的主函数（手动触发）
 */
async function uploadClipboardImage() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
    }

    if (editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('PicGo Paste only works in Markdown files');
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Uploading image...',
            cancellable: false
        },
        async () => {
            try {
                const tempImagePath = await saveClipboardImageToFile();
                
                if (!tempImagePath) {
                    vscode.window.showWarningMessage('No image found in clipboard');
                    return;
                }

                const config = getConfig();
                const imageUrl = await uploadImage(tempImagePath, config);
                
                try {
                    fs.unlinkSync(tempImagePath);
                } catch (e) {
                    // 忽略清理错误
                }

                if (!imageUrl) {
                    vscode.window.showErrorMessage(`Failed to upload image with ${config.provider}. Please check your upload configuration.`);
                    return;
                }

                await insertMarkdownImage(editor, imageUrl);
                vscode.window.showInformationMessage('Image uploaded successfully!');
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${error}`);
            }
        }
    );
}

/**
 * DocumentPasteEditProvider - 实现粘贴时自动上传
 * 这是 VSCode 1.82+ 的官方 API，可以拦截粘贴操作
 */
class PicgoPasteEditProvider implements vscode.DocumentPasteEditProvider {
    
    private static readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('picgo', 'upload');

    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        
        const config = getConfig();
        
        if (!config.autoUploadOnPaste) {
            return undefined;
        }

        // 检查是否有图片
        let hasImage = false;
        for (const [mimeType] of dataTransfer) {
            if (mimeType.startsWith('image/')) {
                hasImage = true;
                break;
            }
        }

        if (!hasImage) {
            return undefined;
        }

        // 检查是否已取消
        if (token.isCancellationRequested) {
            return undefined;
        }

        // 从 DataTransfer 获取图片并保存
        let tempImagePath = await saveDataTransferImageToFile(dataTransfer);
        
        // 如果 DataTransfer 没有图片数据，尝试从系统剪贴板获取
        if (!tempImagePath) {
            tempImagePath = await saveClipboardImageToFile();
        }

        if (!tempImagePath) {
            return undefined;
        }

        // 显示上传状态
        const imageUrl = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Uploading image to ${config.provider}...`,
                cancellable: false
            },
            async () => {
                const result = await uploadImage(tempImagePath!, config);
                
                // 清理临时文件
                try {
                    fs.unlinkSync(tempImagePath!);
                } catch (e) {
                    // 忽略
                }

                return result;
            }
        );

        if (!imageUrl) {
            vscode.window.showErrorMessage(`Failed to upload image with ${config.provider}`);
            return undefined;
        }

        // 创建 Markdown 图片链接
        const markdownImage = `![${buildMarkdownAltText(document)}](${imageUrl})`;
        
        // 创建粘贴编辑（新 API 需要 3 个参数：insertText, title, kind）
        const pasteEdit = new vscode.DocumentPasteEdit(
            markdownImage,
            'Upload with PicGo',
            PicgoPasteEditProvider.kind
        );
        
        vscode.window.showInformationMessage('Image uploaded successfully!');
        
        return [pasteEdit];
    }
}

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('PicGo Paste extension is now active!');

    context.subscriptions.push(outputChannel);
    outputChannel.appendLine('[PicGo Paste] Extension activated');
    //outputChannel.show(true);

    // 注册手动上传命令 (Cmd+Alt+V)
    const uploadCommand = vscode.commands.registerCommand(
        'picgo-paste.uploadFromClipboard',
        uploadClipboardImage
    );
    context.subscriptions.push(uploadCommand);

    // 注册 DocumentPasteEditProvider
    // 这是 VSCode 官方的粘贴拦截 API，当粘贴图片时会自动触发
    const selector: vscode.DocumentSelector = { language: 'markdown' };
    
    const pasteProvider = vscode.languages.registerDocumentPasteEditProvider(
        selector,
        new PicgoPasteEditProvider(),
        {
            providedPasteEditKinds: [
                vscode.DocumentDropOrPasteEditKind.Empty.append('picgo', 'upload')
            ],
            pasteMimeTypes: ['image/*', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
        }
    );
    context.subscriptions.push(pasteProvider);

    console.log('PicGo Paste: DocumentPasteEditProvider registered for Markdown files');
}

/**
 * 扩展停用时调用
 */
export function deactivate() {}
